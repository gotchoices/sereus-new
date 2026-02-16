import debug from 'debug';
import type { Libp2p } from '@libp2p/interface';
import {
  SessionManager,
  createBootstrapManager,
  DEFAULT_PROTOCOL_ID,
  type SessionHooks,
  type SessionConfig,
  type BootstrapLink,
  type BootstrapResult,
  type BootstrapMode,
  type DialogParty,
  type ProvisionResult
} from '@serfab/strand-proto';
import type {
  OpenInvitation,
  FormStrandResult,
  StrandFormationDisclosure
} from './types.js';
import type {
  DisclosureValidator,
  FormationUsageRecorder,
  StrandProvisioner
} from './strand-solicitation.js';

const log = debug('sereus:cadre:formation-manager');

/**
 * Configuration for StrandFormationManager
 */
export interface StrandFormationManagerConfig {
  /** Session timeout in milliseconds */
  sessionTimeoutMs?: number;
  /** Step timeout in milliseconds */
  stepTimeoutMs?: number;
  /** Maximum concurrent sessions */
  maxConcurrentSessions?: number;
  /** Enable debug logging */
  enableDebugLogging?: boolean;
  /** Protocol ID override */
  protocolId?: string;
}

/**
 * Options for creating a StrandFormationManager
 */
export interface StrandFormationManagerOptions {
  /** Validates disclosures from initiators */
  disclosureValidator?: DisclosureValidator;
  /** Records and validates token usage */
  formationUsageRecorder?: FormationUsageRecorder;
  /** Provisions strands after validation */
  strandProvisioner?: StrandProvisioner;
  /** This party's ID for identification */
  partyId: string;
  /** This party's cadre peer addresses */
  cadrePeerAddrs?: string[];
  /** Configuration options */
  config?: StrandFormationManagerConfig;
}

/**
 * StrandFormationManager bridges cadre-core's strand solicitation interfaces
 * with strand-proto's SessionManager for actual protocol handling over libp2p.
 *
 * It implements SessionHooks by delegating to the existing interfaces:
 * - DisclosureValidator -> validateIdentity
 * - FormationUsageRecorder -> validateToken
 * - StrandProvisioner -> provisionStrand
 */
export class StrandFormationManager {
  private readonly sessionManager: SessionManager;
  private readonly disclosureValidator?: DisclosureValidator;
  private readonly formationUsageRecorder?: FormationUsageRecorder;
  private readonly strandProvisioner?: StrandProvisioner;
  private readonly partyId: string;
  private readonly cadrePeerAddrs: string[];
  private registeredNodes: Set<Libp2p> = new Set();

  constructor(options: StrandFormationManagerOptions) {
    this.disclosureValidator = options.disclosureValidator;
    this.formationUsageRecorder = options.formationUsageRecorder;
    this.strandProvisioner = options.strandProvisioner;
    this.partyId = options.partyId;
    this.cadrePeerAddrs = options.cadrePeerAddrs ?? [];

    // Create SessionHooks that delegate to our interfaces
    const hooks = this.createSessionHooks();

    // Create the underlying SessionManager
    const config: Partial<SessionConfig> = {
      sessionTimeoutMs: options.config?.sessionTimeoutMs ?? 30000,
      stepTimeoutMs: options.config?.stepTimeoutMs ?? 5000,
      maxConcurrentSessions: options.config?.maxConcurrentSessions ?? 100,
      enableDebugLogging: options.config?.enableDebugLogging ?? false,
      protocolId: options.config?.protocolId ?? DEFAULT_PROTOCOL_ID
    };

    this.sessionManager = createBootstrapManager(hooks, config);
    log('StrandFormationManager created for party: %s', this.partyId);
  }

  /**
   * Register this manager as a protocol handler on a libp2p node.
   * Call this on the control network node to handle incoming formation requests.
   */
  registerResponder(node: Libp2p, protocolId?: string): void {
    if (this.registeredNodes.has(node)) {
      log('Node already registered');
      return;
    }
    this.sessionManager.register(node, protocolId);
    this.registeredNodes.add(node);
    log('Registered as responder on node');
  }

  /**
   * Unregister the protocol handler from a libp2p node.
   */
  unregisterResponder(node: Libp2p, protocolId?: string): void {
    if (!this.registeredNodes.has(node)) {
      return;
    }
    this.sessionManager.unregister(node, protocolId);
    this.registeredNodes.delete(node);
    log('Unregistered from node');
  }

  /**
   * Form a strand with a responder via an open invitation.
   *
   * This is the initiator-side operation. It:
   * 1. Converts the OpenInvitation to a BootstrapLink
   * 2. Calls SessionManager.initiateBootstrap()
   * 3. Returns the result as a FormStrandResult
   */
  async formStrand(
    invitation: OpenInvitation,
    disclosure: StrandFormationDisclosure,
    node: Libp2p
  ): Promise<FormStrandResult> {
    log('Forming strand with invitation token: %s', invitation.token);

    // Convert OpenInvitation to BootstrapLink
    const link: BootstrapLink = {
      responderPeerAddrs: invitation.bootstrap,
      token: invitation.token,
      tokenExpiryUtc: invitation.expiration.toISOString(),
      mode: 'responderCreates' // Responder provisions the strand
    };

    // The disclosure is passed via the identityBundle in the contact message
    // We store it temporarily so the hooks can access it
    // Note: strand-proto's DialerSession constructs the contact message internally
    // We need to extend this to pass the disclosure - for now we use partyId

    const result = await this.sessionManager.initiateBootstrap(link, node as any);

    log('Strand formed: %s', result.strand.strandId);

    return {
      memberKey: this.partyId, // The initiator's member key
      invitePrivateKey: '', // Would come from key generation
      strandId: result.strand.strandId
    };
  }

  /**
   * Get the number of active sessions
   */
  getActiveSessionCounts(): { listeners: number; dialers: number } {
    return this.sessionManager.getActiveSessionCounts();
  }

  /**
   * Create SessionHooks that delegate to our interfaces
   */
  private createSessionHooks(): SessionHooks {
    return {
      validateToken: async (token: string, sessionId: string) => {
        log('validateToken: %s (session: %s)', token, sessionId);

        if (!this.formationUsageRecorder) {
          // No recorder configured - accept all tokens
          return { mode: 'responderCreates' as BootstrapMode, valid: true };
        }

        const tokenCheck = await this.formationUsageRecorder.isTokenValid(token);
        if (!tokenCheck.valid) {
          log('Token invalid: %s', token);
          return { mode: 'responderCreates' as BootstrapMode, valid: false };
        }

        const isUsed = await this.formationUsageRecorder.isTokenUsed(token);
        if (isUsed) {
          log('Token already used: %s', token);
          return { mode: 'responderCreates' as BootstrapMode, valid: false };
        }

        return { mode: 'responderCreates' as BootstrapMode, valid: true };
      },

      validateIdentity: async (identity: unknown, sessionId: string) => {
        log('validateIdentity (session: %s)', sessionId);

        if (!this.disclosureValidator) {
          // No validator configured - accept all identities
          return true;
        }

        // Extract disclosure from identity bundle
        const disclosure = identity as StrandFormationDisclosure;
        // We need the token here - it's passed via the contact message
        // For now, use a placeholder - this will be refined
        const token = (identity as any)?.token ?? '';

        return this.disclosureValidator.validateDisclosure(token, disclosure);
      },

      provisionStrand: async (
        creator: DialogParty,
        creatorPartyId: string,
        otherPartyId: string,
        sessionId: string
      ): Promise<ProvisionResult> => {
        log('provisionStrand: creator=%s, other=%s (session: %s)',
          creatorPartyId, otherPartyId, sessionId);

        if (!this.strandProvisioner) {
          // No provisioner - return a placeholder
          const strandId = `strand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          return {
            strand: { strandId, createdBy: creator },
            dbConnectionInfo: { endpoint: 'local', credentialsRef: '' }
          };
        }

        // Determine initiator/responder keys based on creator
        const initiatorKey = creator === 'initiator' ? creatorPartyId : otherPartyId;
        const responderKey = creator === 'responder' ? creatorPartyId : otherPartyId;

        const result = await this.strandProvisioner.provisionStrand(
          '', // sAppId - would come from invitation
          initiatorKey,
          responderKey
        );

        return {
          strand: { strandId: result.strandId, createdBy: creator },
          dbConnectionInfo: { endpoint: 'local', credentialsRef: '' }
        };
      },

      validateResponse: async (response: unknown, sessionId: string) => {
        log('validateResponse (session: %s)', sessionId);
        // Accept all responses for now
        return true;
      },

      validateDatabaseResult: async (result: unknown, sessionId: string) => {
        log('validateDatabaseResult (session: %s)', sessionId);
        // Accept all database results for now
        return true;
      }
    };
  }
}

/**
 * Create a StrandFormationManager with the given options
 */
export function createStrandFormationManager(
  options: StrandFormationManagerOptions
): StrandFormationManager {
  return new StrandFormationManager(options);
}

