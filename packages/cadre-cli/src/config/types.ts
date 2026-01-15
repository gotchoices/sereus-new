import type { NodeProfile, LatencyHint, StrandFilter } from '@sereus/cadre-core';

/**
 * CLI configuration file format (YAML/JSON)
 */
export interface CliConfigFile {
  /** Node identity - path to key file or inline key */
  identity?: {
    /** Path to file containing the private key (PEM or raw bytes) */
    keyFile?: string;
    /** Inline private key as hex string (not recommended for production) */
    privateKeyHex?: string;
  };

  /** Control network configuration */
  controlNetwork: {
    /** UUID of the party/control network */
    partyId: string;
    /** Multiaddrs of bootstrap nodes */
    bootstrapNodes: string[];
  };

  /** Node profile: transaction or storage */
  profile: NodeProfile;

  /** Strand filter configuration */
  strandFilter?:
    | 'all'
    | 'none'
    | { sAppId: string }
    | { strandId: string };

  /** Storage configuration (required for storage profile) */
  storage?: {
    type: 'memory' | 'file';
    path?: string;
    quotaBytes?: number;
  };

  /** Network configuration */
  network?: {
    listenAddrs?: string[];
    announceAddrs?: string[];
    relayAddrs?: string[];
  };

  /** Hibernation settings */
  hibernation?: {
    enabled: boolean;
    defaultLatencyHint?: LatencyHint;
  };

  /** Polling interval for strand watcher in ms */
  strandWatchInterval?: number;
}

/**
 * Environment variable mappings for config overrides
 */
export const ENV_MAPPINGS = {
  CADRE_PARTY_ID: 'controlNetwork.partyId',
  CADRE_BOOTSTRAP_NODES: 'controlNetwork.bootstrapNodes',
  CADRE_PROFILE: 'profile',
  CADRE_KEY_FILE: 'identity.keyFile',
  CADRE_STORAGE_PATH: 'storage.path',
  CADRE_STORAGE_TYPE: 'storage.type',
  CADRE_LISTEN_ADDRS: 'network.listenAddrs',
  CADRE_ANNOUNCE_ADDRS: 'network.announceAddrs',
  CADRE_RELAY_ADDRS: 'network.relayAddrs',
  CADRE_HIBERNATION_ENABLED: 'hibernation.enabled',
  CADRE_STRAND_FILTER: 'strandFilter',
} as const;

/**
 * Resolved configuration after loading and applying environment overrides
 */
export interface ResolvedConfig {
  privateKey?: Uint8Array;
  controlNetwork: {
    partyId: string;
    bootstrapNodes: string[];
  };
  profile: NodeProfile;
  strandFilter: StrandFilter;
  storage?: {
    type: 'memory' | 'file';
    path?: string;
    quotaBytes?: number;
  };
  network?: {
    listenAddrs?: string[];
    announceAddrs?: string[];
    relayAddrs?: string[];
  };
  hibernation?: {
    enabled: boolean;
    defaultLatencyHint?: LatencyHint;
  };
  strandWatchInterval?: number;
}

