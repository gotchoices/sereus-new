/**
 * cadre-phone.ts — CadreNode configured for a React Native phone node.
 *
 * - WebSocket + circuit-relay transports (no TCP in RN)
 * - MMKV-backed storage via db-p2p-storage-rn
 * - Transaction profile (Ring Zulu only, intermittent connectivity)
 * - Authority role: the phone holds the signing keys
 */

import { CadreNode } from '@serfab/cadre-core';
import type {
  CadreNodeConfig,
  ControlNetworkSeed,
  ApplySeedResult,
  StrandInstance,
  StrandConfig,
} from '@serfab/cadre-core';
import { multiaddr } from '@multiformats/multiaddr';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPair, privateKeyToProtobuf, privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import type { PrivateKey } from '@libp2p/interface';
import { MMKV } from 'react-native-mmkv';
import { MMKVRawStorage } from '@optimystic/db-p2p-storage-rn';

// ── MMKV instance shared across the app ──────────────────────────────────────
// NOTE: this app is pinned to react-native-mmkv ^3.x where `MMKV` is a value
// class.  v4 (Nitro Modules) makes `MMKV` a type-only export and the runtime
// API becomes `createMMKV({...})`.  When upgrading, change the import to
// `import { createMMKV, type MMKV } from 'react-native-mmkv'` and replace
// `new MMKV({...})` below with `createMMKV({...})`.

const mmkv = new MMKV({ id: 'sereus-chat' });

// ── Storage factory ──────────────────────────────────────────────────────────
// Each strand (and the control network) gets an isolated key namespace inside
// the single MMKV instance.

function createStorage(strandId: string) {
  return new MMKVRawStorage({ mmkv, prefix: `sereus:${strandId}:` });
}

// ── Peer identity ───────────────────────────────────────────────────────────
// Persist a single Ed25519 keypair so the phone keeps the same PeerId across
// restarts. MMKV is not secure storage (not Keychain/Keystore) — acceptable
// for v1; secure storage is tracked separately.

const PEER_KEY_STORAGE_KEY = 'sereus:peer-private-key';

async function loadOrCreatePhoneKey(): Promise<PrivateKey> {
	const stored = mmkv.getBuffer(PEER_KEY_STORAGE_KEY);
	if (stored) {
		return privateKeyFromProtobuf(stored);
	}
	const key = await generateKeyPair('Ed25519');
	mmkv.set(PEER_KEY_STORAGE_KEY, Buffer.from(privateKeyToProtobuf(key)));
	return key;
}

// ── Singleton ────────────────────────────────────────────────────────────────

let node: CadreNode | null = null;

export interface PhoneNodeOptions {
  /** Party ID — identifies this cadre. Generated on first run. */
  partyId: string;
  /** Bootstrap multiaddrs for the drone (WebSocket). */
  bootstrapAddrs: string[];
}

/**
 * Get or create the CadreNode singleton.
 */
export function getPhoneNode(): CadreNode | null {
  return node;
}

/**
 * Start the phone CadreNode.
 * Idempotent — returns the existing node if already running.
 */
export async function startPhoneNode(opts: PhoneNodeOptions): Promise<CadreNode> {
  if (node?.isRunning) return node;

  const privateKey = await loadOrCreatePhoneKey();

  const config: CadreNodeConfig = {
    privateKey,
    controlNetwork: {
      partyId: opts.partyId,
      bootstrapNodes: opts.bootstrapAddrs,
    },
    profile: 'transaction',
    storage: {
      provider: createStorage,
    },
    network: {
      transports: [webSockets(), circuitRelayTransport()],
      listenAddrs: [], // RN cannot listen for inbound connections
    },
    strandFilter: { mode: 'all' },
    hibernation: { enabled: false },
  };

  node = new CadreNode(config);
  await node.start();
  return node;
}

/**
 * Stop the phone CadreNode and release resources.
 */
export async function stopPhoneNode(): Promise<void> {
  if (node) {
    await node.stop();
    node = null;
  }
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

/**
 * Apply a seed received from the drone (or another authority).
 */
export async function applySeed(seed: ControlNetworkSeed): Promise<ApplySeedResult> {
  if (!node) throw new Error('Phone node not started');
  return node.applySeed(seed);
}

/**
 * Decode a base64url-encoded seed string into a ControlNetworkSeed object.
 */
export function decodeSeed(encoded: string): ControlNetworkSeed {
  if (!node) throw new Error('Phone node not started');
  return node.decodeSeed(encoded);
}

// ── Peer helpers ─────────────────────────────────────────────────────────────

/**
 * Dial a peer by multiaddr on the running control network node.
 * Use this to add a drone (or another peer) after starting without bootstrap.
 */
export async function dialPeer(addr: string): Promise<void> {
	if (!node) throw new Error('Phone node not started');
	const libp2p = node.getControlNode();
	if (!libp2p) throw new Error('Control network not available');
	await libp2p.dial(multiaddr(addr));
}

// ── Strand helpers ───────────────────────────────────────────────────────────

/**
 * Add a strand to this node.  The strand must already exist in the control
 * database (inserted via seed or direct write).
 */
export async function addStrand(config: StrandConfig): Promise<StrandInstance> {
  if (!node) throw new Error('Phone node not started');
  return node.addStrand(config);
}

