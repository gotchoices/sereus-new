import type { Libp2p, PeerId } from '@libp2p/interface';

/**
 * Node profile determines storage participation
 */
export type NodeProfile = 'transaction' | 'storage';

/**
 * Strand filter configuration - determines which strands this node participates in
 */
export type StrandFilter =
  | { mode: 'all' }                           // All strands (default for servers)
  | { mode: 'sAppId'; sAppId: string }        // Only strands for specific sApp
  | { mode: 'strandId'; strandId: string }    // Single specific strand
  | { mode: 'none' };                         // Control network only

/**
 * Latency hint for strand hibernation behavior
 */
export type LatencyHint = 'realtime' | 'interactive' | 'background' | 'archive';

/**
 * Hibernation timeout configuration per latency hint (in milliseconds)
 */
export interface HibernationTimeouts {
  /** Time before transitioning from active to idle */
  idleTimeout: number;
  /** Time before transitioning from idle to hibernating */
  hibernateTimeout: number;
  /** Interval for check-ins while hibernating */
  checkInInterval: number;
}

/**
 * Default hibernation timeouts per latency hint
 */
export const HIBERNATION_TIMEOUTS: Record<LatencyHint, HibernationTimeouts> = {
  realtime: {
    idleTimeout: Infinity,        // Never idle
    hibernateTimeout: Infinity,   // Never hibernate
    checkInInterval: Infinity     // N/A
  },
  interactive: {
    idleTimeout: 5 * 60 * 1000,   // 5 minutes
    hibernateTimeout: 15 * 60 * 1000, // 15 minutes after idle
    checkInInterval: 30 * 1000    // 30 seconds
  },
  background: {
    idleTimeout: 1 * 60 * 1000,   // 1 minute
    hibernateTimeout: 5 * 60 * 1000,  // 5 minutes after idle
    checkInInterval: 5 * 60 * 1000    // 5 minutes
  },
  archive: {
    idleTimeout: 10 * 1000,       // 10 seconds
    hibernateTimeout: 30 * 1000,  // 30 seconds after idle
    checkInInterval: 60 * 60 * 1000   // 1 hour
  }
};

/**
 * Storage configuration for storage profile nodes
 */
export interface StorageConfig {
  type: 'memory' | 'file';
  path?: string;
  quotaBytes?: number;
}

/**
 * Network configuration for libp2p
 */
export interface NetworkConfig {
  listenAddrs?: string[];
  announceAddrs?: string[];
  relayAddrs?: string[];
  /**
   * Enable circuit relay server - allows this node to relay connections for other peers.
   * When undefined, defaults to true for storage profile nodes (they typically have
   * better connectivity and uptime), false for transaction profile nodes.
   */
  enableRelay?: boolean;
}

/**
 * Hibernation configuration
 */
export interface HibernationConfig {
  enabled: boolean;
  defaultLatencyHint?: LatencyHint;
  /** Custom timeouts per latency hint (overrides defaults) */
  customTimeouts?: Partial<Record<LatencyHint, Partial<HibernationTimeouts>>>;
}

/**
 * Control network configuration
 */
export interface ControlNetworkConfig {
  partyId: string;
  bootstrapNodes: string[];
}

/**
 * Main configuration for a CadreNode
 */
export interface CadreNodeConfig {
  /** If provided, use this keypair for the node identity */
  privateKey?: Uint8Array;

  /** Control network connection settings */
  controlNetwork: ControlNetworkConfig;

  /** Node profile: transaction-only or storage */
  profile: NodeProfile;

  /** Which strands to participate in */
  strandFilter?: StrandFilter;

  /** Storage configuration (only for storage profile) */
  storage?: StorageConfig;

  /** Network configuration */
  network?: NetworkConfig;

  /** Hibernation configuration */
  hibernation?: HibernationConfig;

  /** Polling interval for strand watcher in ms (default: 5000) */
  strandWatchInterval?: number;
}

/**
 * Status of a strand instance
 */
export type StrandStatus = 
  | 'starting' 
  | 'active' 
  | 'idle' 
  | 'hibernating' 
  | 'stopping' 
  | 'stopped' 
  | 'error';

/**
 * App information from strand header
 */
export interface SAppInfo {
  id: string;
  version: string;
  schema: string;
  signature: string;
}

/**
 * Strand instance state
 */
export interface StrandInstance {
  strandId: string;
  status: StrandStatus;
  sAppInfo?: SAppInfo;

  /** The libp2p node for this strand (only when active/idle) */
  libp2pNode?: Libp2p;

  /** Membership info for closed strands */
  memberKey?: string;
  memberPrivateKey?: string;

  /** Activity tracking */
  connectedPeers: number;
  lastActivity: Date;
  nextCheckIn?: Date;

  /** Latency hint from app or override */
  latencyHint: LatencyHint;

  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Strand row from control network - basic membership info
 */
export interface StrandRow {
  Id: string;
  MemberPrivateKey: string | null;
  Type: 'o' | 'c';
}

/**
 * sApp configuration provided by the hosting application when creating a strand.
 * This is what the app developer provides - NOT loaded from the network.
 */
export interface SAppConfig {
  /** Public key of the sApp author */
  id: string;
  /** Version of the sApp */
  version: string;
  /** The declarative schema DDL */
  schema: string;
  /** Author's signature over the schema for verification */
  signature: string;
  /** Latency hint for hibernation behavior (optional, defaults to config) */
  latencyHint?: LatencyHint;
}

/**
 * Full strand configuration when adding a strand via the API
 */
export interface StrandConfig {
  /** Strand row from control network */
  strandRow: StrandRow;
  /** sApp configuration provided by the hosting application */
  sAppConfig: SAppConfig;
}

/**
 * Registration data for enrolling a new peer
 */
export interface PeerRegistration {
  peerId: string;
  bootstrapNodes: string[];
  authorityKey: string;
  signature: string;
}

/**
 * Result of creating a new cadre peer
 */
export interface CreatePeerResult {
  peerId: PeerId;
  privateKey: Uint8Array;
}

/**
 * Arachnode ring participation stub - will be implemented when arachnode is built
 */
export interface ArachnodeConfig {
  /** Enable Ring Zulu (transaction ring) - all nodes participate */
  enableRingZulu: boolean;
  /** Storage ring participation (storage profile only) */
  storageRing?: {
    /** Which ring to participate in based on capacity */
    ring: number;
    /** Partition within the ring */
    partition?: number;
  };
}

/**
 * Events emitted by CadreNode
 */
export interface CadreNodeEvents {
  'strand:started': { strandId: string };
  'strand:stopped': { strandId: string };
  'strand:error': { strandId: string; error: Error };
  'strand:idle': { strandId: string };
  'strand:hibernating': { strandId: string };
  'strand:waking': { strandId: string };
  'control:connected': void;
  'control:disconnected': void;
}

