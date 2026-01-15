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
}

/**
 * Hibernation configuration
 */
export interface HibernationConfig {
  enabled: boolean;
  defaultLatencyHint?: LatencyHint;
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
 * Strand row from control network
 */
export interface StrandRow {
  Id: string;
  MemberPrivateKey: string | null;
  Type: 'o' | 'c';
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
 * Events emitted by CadreNode
 */
export interface CadreNodeEvents {
  'strand:started': { strandId: string };
  'strand:stopped': { strandId: string };
  'strand:error': { strandId: string; error: Error };
  'control:connected': void;
  'control:disconnected': void;
}

