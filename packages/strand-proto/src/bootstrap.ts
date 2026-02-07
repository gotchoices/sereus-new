/*
 * Sereus Bootstrap Session Manager
 *
 * Generic invitation-based bootstrap over libp2p to provision a shared strand (DB).
 * Protocol string is configurable; default provided.
 */

import type { Libp2p } from 'libp2p'
import { multiaddr as toMultiaddr } from '@multiformats/multiaddr'
import { pipe } from 'it-pipe'
import { encode as lpEncode, decode as lpDecode } from 'it-length-prefixed'

export const DEFAULT_PROTOCOL_ID = '/sereus/bootstrap/1.0.0'

// Dialog party (generic)
export type DialogParty = 'initiator' | 'responder'

// Generic mode describing who provisions the DB/strand
// responderCreates: responder provisions and returns info in Response (2-message)
// initiatorCreates: initiator provisions after approval and sends DB info (3-message)
export type BootstrapMode = 'responderCreates' | 'initiatorCreates'

export type ListenerState = 'L_PROCESS_CONTACT' | 'L_SEND_RESPONSE' | 'L_AWAIT_DATABASE' | 'L_DONE' | 'L_FAILED'
export type DialerState = 'D_SEND_CONTACT' | 'D_AWAIT_RESPONSE' | 'D_PROVISION_DATABASE' | 'D_DONE' | 'D_FAILED'

/**
 * Minimal libp2p stream surface compatible with libp2p 3.x.
 * In libp2p 3.x, streams are AsyncIterable for reading and use send() for writing.
 */
export interface LibP2PStream extends AsyncIterable<Uint8Array> {
  /** Send data to the stream (libp2p 3.x API) */
  send(data: Uint8Array): boolean
  /** Close the stream */
  close(): Promise<void>
  /** Abort the stream with an error */
  abort?(err: Error): void
}

export interface SessionConfig {
  sessionTimeoutMs: number
  stepTimeoutMs: number
  maxConcurrentSessions: number
  enableDebugLogging?: boolean
  protocolId?: string
}

export interface SessionHooks {
  // Return Mode (preferred)
  validateToken(token: string, sessionId: string): Promise<{ mode: BootstrapMode, valid: boolean }>
  validateIdentity(identity: unknown, sessionId: string): Promise<boolean>
  provisionStrand(creator: DialogParty, creatorPartyId: string, otherPartyId: string, sessionId: string): Promise<ProvisionResult>
  validateResponse(response: unknown, sessionId: string): Promise<boolean>
  validateDatabaseResult(result: unknown, sessionId: string): Promise<boolean>
}

export interface BootstrapLink {
  responderPeerAddrs: string[]
  token: string
  tokenExpiryUtc: string
  // Explicit mode (who creates the DB)
  mode?: BootstrapMode
  identityRequirements?: string
  protocolId?: string
}

export interface InboundContactMessage {
  token: string
  partyId: string
  identityBundle: unknown
  cadrePeerAddrs: string[]
}

export interface ProvisioningResultMessage {
  approved: boolean
  reason?: string
  partyId?: string
  cadrePeerAddrs?: string[]
  provisionResult?: ProvisionResult
}

export interface DatabaseResultMessage {
  strand: { strandId: string, createdBy: DialogParty }
  dbConnectionInfo: { endpoint: string, credentialsRef: string }
}

export interface ProvisionResult {
  strand: { strandId: string, createdBy: DialogParty }
  dbConnectionInfo: { endpoint: string, credentialsRef: string }
}

export interface BootstrapResult {
  strand: { strandId: string, createdBy: DialogParty }
  dbConnectionInfo: { endpoint: string, credentialsRef: string }
}

/**
 * Write a JSON object to the stream using length-prefixed encoding.
 * Length-prefixed encoding allows the receiver to know when a message ends
 * without relying on stream close.
 *
 * Note: This function never closes the stream. Streams should be closed
 * explicitly by the caller when all communication is complete.
 */
async function writeJson(stream: LibP2PStream, obj: unknown): Promise<void> {
  const jsonData = JSON.stringify(obj)
  const encoded = new TextEncoder().encode(jsonData)
  // Use length-prefixed encoding to frame the message
  const lpEncoded = pipe([encoded], lpEncode)
  for await (const chunk of lpEncoded) {
    stream.send(chunk.subarray())
  }
}

/**
 * Read a JSON object from the stream using length-prefixed decoding.
 * Returns the first complete message received.
 */
async function readJson<T = unknown>(stream: LibP2PStream, debug?: boolean): Promise<T> {
  try {
    const decoder = new TextDecoder()
    if (debug) console.debug('[readJson] starting to read from stream')
    if (debug) console.debug('[readJson] stream type:', typeof stream, 'keys:', Object.keys(stream as any))
    // Use length-prefixed decoding to read exactly one message
    if (debug) console.debug('[readJson] calling lpDecode via pipe')
    const decoded = pipe(stream, lpDecode)
    if (debug) console.debug('[readJson] created decoded iterator, type:', typeof decoded)
    if (debug) console.debug('[readJson] starting iteration')
    for await (const data of decoded) {
      if (debug) console.debug('[readJson] received data:', data.byteLength, 'bytes')
      const message = decoder.decode(data.subarray())
      if (debug) console.debug('[readJson] decoded message:', message.substring(0, 100))
      return JSON.parse(message) as T
    }
    throw new Error('Received empty data from stream')
  } catch (err) {
    if (debug) console.debug('[readJson] ERROR:', err)
    throw err
  }
}

export class SessionManager {
  private listenerSessions = new Map<string, ListenerSession>()
  private dialerSessions = new Map<string, DialerSession>()
  private sessionCounter = 0

  constructor(
    private hooks: SessionHooks,
    private config: SessionConfig = {
      sessionTimeoutMs: 30000,
      stepTimeoutMs: 5000,
      maxConcurrentSessions: 100,
      protocolId: DEFAULT_PROTOCOL_ID
    }
  ) {}

  private generateSessionId(): string {
    return `session-${Date.now()}-${++this.sessionCounter}`
  }

  // Helper to register/unregister libp2p protocol handlers
  register(node: Libp2p, protocolId?: string): void {
    const pid = protocolId || this.config.protocolId || DEFAULT_PROTOCOL_ID
    // In libp2p 3.x, StreamHandler receives (stream, connection) as separate arguments
    node.handle(pid, async (stream: unknown) => {
      await this.handleNewStream(stream as LibP2PStream)
    })
  }
  unregister(node: Libp2p, protocolId?: string): void {
    const pid = protocolId || this.config.protocolId || DEFAULT_PROTOCOL_ID
    try { node.unhandle(pid) } catch {}
  }

  async handleNewStream(stream: LibP2PStream): Promise<void> {
    if (this.listenerSessions.size >= this.config.maxConcurrentSessions) {
      await writeJson(stream, { approved: false, reason: 'Too many concurrent sessions' })
      await stream.close()
      return
    }
    const sessionId = this.generateSessionId()
    const session = new ListenerSession(sessionId, stream, this.hooks, this.config)
    this.listenerSessions.set(sessionId, session)
    session.execute().catch(() => {}).finally(() => this.listenerSessions.delete(sessionId))
  }

  async initiateBootstrap(link: BootstrapLink, node: Libp2p): Promise<BootstrapResult> {
    const sessionId = this.generateSessionId()
    const session = new DialerSession(sessionId, link, node, this.hooks, this.config)
    this.dialerSessions.set(sessionId, session)
    try { return await session.execute() } finally { this.dialerSessions.delete(sessionId) }
  }

  getActiveSessionCounts(): { listeners: number, dialers: number } {
    return { listeners: this.listenerSessions.size, dialers: this.dialerSessions.size }
  }
}

function tokenInfoToMode(tokenInfo: { mode?: BootstrapMode }): BootstrapMode {
  if (tokenInfo.mode) return tokenInfo.mode
  // Default to responderCreates if unspecified
  return 'responderCreates'
}
function linkToMode(link: BootstrapLink): BootstrapMode {
  if (link.mode) return link.mode
  return 'responderCreates'
}

export class ListenerSession {
  private state: ListenerState = 'L_PROCESS_CONTACT'
  private startTime = Date.now()
  private tokenInfo: { mode?: BootstrapMode, valid: boolean } | null = null
  private contactMessage: InboundContactMessage | null = null
  private provisionResult: ProvisionResult | null = null

  constructor(
    private sessionId: string,
    private stream: LibP2PStream,
    private hooks: SessionHooks,
    private config: SessionConfig
  ) {}

  async execute(): Promise<void> {
    try {
      await this.withTimeout(this.config.sessionTimeoutMs, async () => {
        await this.processContact()
        await this.sendResponse()
        if (tokenInfoToMode(this.tokenInfo!) === 'initiatorCreates') await this.awaitDatabase()
        this.transitionTo('L_DONE')
      })
    } catch (e) {
      this.transitionTo('L_FAILED', e)
      throw e
    } finally {
      // Always close the stream when the session is complete
      this.closeStream()
    }
  }

  private async processContact(): Promise<void> {
    if (this.config.enableDebugLogging) console.debug(`[L:${this.sessionId}] processContact: waiting for contact`)
    const msg = await this.withStepTimeout(() => readJson<InboundContactMessage>(this.stream, this.config.enableDebugLogging))
    if (this.config.enableDebugLogging) console.debug(`[L:${this.sessionId}] received contact`, msg)
    this.contactMessage = msg
    const tokenInfo = await this.withStepTimeout(() => this.hooks.validateToken(msg.token, this.sessionId))
    this.tokenInfo = tokenInfo as any
    if (this.config.enableDebugLogging) console.debug(`[L:${this.sessionId}] token validated`, tokenInfo)
    if (!this.tokenInfo?.valid) { await this.sendRejection('Invalid token'); throw new Error('Invalid token') }
    const okId = await this.withStepTimeout(() => this.hooks.validateIdentity(msg.identityBundle, this.sessionId))
    if (this.config.enableDebugLogging) console.debug(`[L:${this.sessionId}] identity validated=${okId}`)
    if (!okId) { await this.sendRejection('Invalid identity'); throw new Error('Invalid identity') }
    const mode = tokenInfoToMode(this.tokenInfo!)
    if (mode === 'responderCreates') {
      if (this.config.enableDebugLogging) console.debug(`[L:${this.sessionId}] provisioning (responderCreates mode)`)
      this.provisionResult = await this.withStepTimeout(() => this.hooks.provisionStrand('responder', this.sessionId, msg.partyId, this.sessionId))
      if (this.config.enableDebugLogging) console.debug(`[L:${this.sessionId}] provisioned`, this.provisionResult)
    }
  }

  private async sendResponse(): Promise<void> {
    this.transitionTo('L_SEND_RESPONSE')
    if (!this.tokenInfo || !this.contactMessage) throw new Error('Invalid state')
    const response: ProvisioningResultMessage = {
      approved: true,
      partyId: this.sessionId,
      cadrePeerAddrs: ['cadre-a-1.local', 'cadre-a-2.local'],
      provisionResult: this.provisionResult || undefined
    }
    // Send response - don't close stream yet, caller handles stream lifecycle
    if (this.config.enableDebugLogging) console.debug(`[L:${this.sessionId}] sending response`, response)
    await this.withStepTimeout(() => writeJson(this.stream, response))
    if (this.config.enableDebugLogging) console.debug(`[L:${this.sessionId}] response sent`)
  }

  private async awaitDatabase(): Promise<void> {
    this.transitionTo('L_AWAIT_DATABASE')
    if (this.config.enableDebugLogging) console.debug(`[L:${this.sessionId}] awaiting database message`)
    const db = await this.withStepTimeout(() => readJson<DatabaseResultMessage>(this.stream))
    const valid = await this.withStepTimeout(() => this.hooks.validateDatabaseResult(db, this.sessionId))
    if (!valid) throw new Error('Invalid database result')
    if (this.config.enableDebugLogging) console.debug(`[L:${this.sessionId}] database message accepted`)
  }

  private transitionTo(s: ListenerState, _e?: unknown): void { this.state = s }
  private async withTimeout<T>(ms: number, op: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Session timeout after ${ms}ms`)), ms)
      op().then(resolve).catch(reject).finally(() => clearTimeout(t))
    })
  }
  private withStepTimeout<T>(op: () => Promise<T>): Promise<T> { return this.withTimeout(this.config.stepTimeoutMs, op) }
  private async sendRejection(reason: string): Promise<void> {
    await writeJson(this.stream, { approved: false, reason })
    await this.stream.close()
  }
  private closeStream(): void { try { this.stream.close?.() } catch {} }
}

export class DialerSession {
  private state: DialerState = 'D_SEND_CONTACT'
  private startTime = Date.now()
  private stream: LibP2PStream | null = null
  private responseMessage: ProvisioningResultMessage | null = null

  constructor(
    private sessionId: string,
    private link: BootstrapLink,
    private node: Libp2p,
    private hooks: SessionHooks,
    private config: SessionConfig
  ) {}

  async execute(): Promise<BootstrapResult> {
    try {
      return await this.withTimeout(this.config.sessionTimeoutMs, async () => {
        this.stream = await this.connectAndSend()
        this.responseMessage = await this.awaitResponse()
        const mode = linkToMode(this.link)
        if (mode === 'initiatorCreates') {
          return await this.provisionAndSendDatabase()
        } else {
          if (!this.responseMessage.provisionResult) throw new Error('Missing provision result for responderCreates mode')
          return this.responseMessage.provisionResult
        }
      })
    } catch (e) {
      this.state = 'D_FAILED'
      throw e
    } finally {
      // Always close the stream when the session is complete
      this.closeStream()
    }
  }

  private async connectAndSend(): Promise<LibP2PStream> {
    const responderAddr = toMultiaddr(this.link.responderPeerAddrs[0])
    const pid = this.link.protocolId || this.config.protocolId || DEFAULT_PROTOCOL_ID
    if (this.config.enableDebugLogging) console.debug(`[D:${this.sessionId}] dialing`, responderAddr.toString(), 'pid', pid)
    const stream = await this.withStepTimeout(async () => (await this.node.dialProtocol(responderAddr, pid)) as unknown as LibP2PStream)
    if (this.config.enableDebugLogging) console.debug(`[D:${this.sessionId}] dialed; sending contact`)
    const contact: InboundContactMessage = {
      token: this.link.token,
      partyId: this.sessionId,
      identityBundle: { partyId: this.sessionId },
      cadrePeerAddrs: ['cadre-b-1.local', 'cadre-b-2.local']
    }
    // Send contact - don't close stream, we need to read the response
    await this.withStepTimeout(() => writeJson(stream, contact))
    if (this.config.enableDebugLogging) console.debug(`[D:${this.sessionId}] contact sent`)
    return stream
  }

  private async awaitResponse(): Promise<ProvisioningResultMessage> {
    if (!this.stream) throw new Error('No stream')
    if (this.config.enableDebugLogging) console.debug(`[D:${this.sessionId}] awaiting response`)
    const response = await this.withStepTimeout(() => readJson<ProvisioningResultMessage>(this.stream!, this.config.enableDebugLogging))
    if (this.config.enableDebugLogging) console.debug(`[D:${this.sessionId}] response received`, response)
    if (!response.approved) throw new Error(`Bootstrap rejected: ${response.reason || 'No reason provided'}`)
    const ok = await this.withStepTimeout(() => this.hooks.validateResponse(response, this.sessionId))
    if (!ok) throw new Error('Invalid response from peer')
    return response
  }

  private async provisionAndSendDatabase(): Promise<BootstrapResult> {
    if (!this.responseMessage) throw new Error('No response message available')
    let provision: ProvisionResult
    try {
      provision = await this.withStepTimeout(() => this.hooks.provisionStrand('initiator', this.sessionId, this.responseMessage!.partyId!, this.sessionId))
    } catch (e: any) {
      this.state = 'D_FAILED'
      throw new Error(`Provisioning failed: ${e?.message || String(e)}`)
    }
    const dbMsg: DatabaseResultMessage = { strand: provision.strand, dbConnectionInfo: provision.dbConnectionInfo }
    const pid = this.link.protocolId || this.config.protocolId || DEFAULT_PROTOCOL_ID
    const maddr = toMultiaddr(this.link.responderPeerAddrs[0])
    const newStream = await this.withStepTimeout(async () => (await this.node.dialProtocol(maddr, pid)) as unknown as LibP2PStream)
    await this.withStepTimeout(() => writeJson(newStream, dbMsg))
    await newStream.close()
    this.closeStream()
    return provision
  }

  private async withTimeout<T>(ms: number, op: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Session timeout after ${ms}ms`)), ms)
      op().then(resolve).catch(reject).finally(() => clearTimeout(t))
    })
  }
  private withStepTimeout<T>(op: () => Promise<T>): Promise<T> { return this.withTimeout(this.config.stepTimeoutMs, op) }
  private closeStream(): void { try { this.stream?.close?.() } catch {} }
}

export function createBootstrapManager(hooks: SessionHooks, config?: Partial<SessionConfig>): SessionManager {
  const full: SessionConfig = {
    sessionTimeoutMs: 30000,
    stepTimeoutMs: 5000,
    maxConcurrentSessions: 100,
    enableDebugLogging: false,
    protocolId: DEFAULT_PROTOCOL_ID,
    ...config
  }
  return new SessionManager(hooks, full)
}


