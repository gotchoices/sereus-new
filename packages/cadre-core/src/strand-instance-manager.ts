import debug from 'debug';
import path from 'path';
import type { Libp2p } from '@libp2p/interface';
import { createLibp2pNode } from '@optimystic/db-p2p';
import { StrandDatabase } from './strand-database.js';
import type {
  StrandInstance,
  StrandRow,
  StorageConfig,
  NetworkConfig,
  LatencyHint,
  NodeProfile,
  SAppConfig,
  SAppInfo
} from './types.js';

const log = debug('sereus:cadre:strand-manager');

/**
 * Configuration for starting a strand instance
 */
export interface StartStrandConfig {
  strandRow: StrandRow;
  /** sApp configuration provided by the hosting application */
  sAppConfig: SAppConfig;
  storage?: StorageConfig;
  network?: NetworkConfig;
  profile: NodeProfile;
  defaultLatencyHint: LatencyHint;
}

/**
 * Get the isolated storage path for a specific strand
 */
export function getStrandStoragePath(basePath: string, strandId: string): string {
  // Sanitize strandId for filesystem safety (UUIDs should be safe, but just in case)
  const safeId = strandId.replace(/[^a-zA-Z0-9-]/g, '_');
  return path.join(basePath, 'strands', safeId);
}

/**
 * Manages individual strand instances - creates and destroys isolated libp2p nodes
 * for each strand the cadre participates in.
 */
export class StrandInstanceManager {
  private instances: Map<string, StrandInstance> = new Map();
  private stopping = false;

  constructor() {
    log('StrandInstanceManager created');
  }

  /**
   * Get all current strand instances
   */
  getInstances(): Map<string, StrandInstance> {
    return new Map(this.instances);
  }

  /**
   * Get a specific strand instance
   */
  getInstance(strandId: string): StrandInstance | undefined {
    return this.instances.get(strandId);
  }

  /**
   * Check if a strand is currently running
   */
  hasStrand(strandId: string): boolean {
    return this.instances.has(strandId);
  }

  /**
   * Start a new strand instance
   */
  async startStrand(config: StartStrandConfig): Promise<StrandInstance> {
    const { strandRow, sAppConfig } = config;
    const strandId = strandRow.Id;

    if (this.stopping) {
      throw new Error('StrandInstanceManager is stopping');
    }

    if (this.instances.has(strandId)) {
      log('Strand %s already running', strandId);
      return this.instances.get(strandId)!;
    }

    log('Starting strand instance: %s (sApp: %s v%s)', strandId, sAppConfig.id, sAppConfig.version);

    // Convert SAppConfig to SAppInfo for the instance
    const sAppInfo: SAppInfo = {
      id: sAppConfig.id,
      version: sAppConfig.version,
      schema: sAppConfig.schema,
      signature: sAppConfig.signature
    };

    // Determine latency hint: sApp config > default
    const latencyHint = sAppConfig.latencyHint ?? config.defaultLatencyHint;

    const instance: StrandInstance = {
      strandId,
      status: 'starting',
      sAppInfo,
      memberPrivateKey: strandRow.MemberPrivateKey ?? undefined,
      connectedPeers: 0,
      lastActivity: new Date(),
      latencyHint
    };

    this.instances.set(strandId, instance);

    try {
      // Calculate isolated storage path for this strand
      let strandStoragePath: string | undefined;
      if (config.storage?.path && config.storage.type === 'file') {
        strandStoragePath = getStrandStoragePath(config.storage.path, strandId);
        log('Strand %s storage path: %s', strandId, strandStoragePath);
      }

      // Create isolated libp2p node for this strand
      // Note: protocolPrefix would be used by libp2p services, but createLibp2pNode
      // may not support it yet - tracked for future implementation
      const _protocolPrefix = `/sereus/strand/${strandId}`;

      // Determine relay mode: if explicitly set in config, use that;
      // otherwise default to true for storage profile nodes
      const enableRelay = config.network?.enableRelay ?? (config.profile === 'storage');

      const node = await createLibp2pNode({
        port: 0, // Random port
        bootstrapNodes: [], // Will be populated from strand cohort
        networkName: `strand-${strandId}`,
        storageType: config.storage?.type ?? 'memory',
        storagePath: strandStoragePath,
        fretProfile: config.profile === 'storage' ? 'core' : 'edge',
        relay: enableRelay,
        clusterSize: 3,
        clusterPolicy: {
          allowDownsize: true,
          sizeTolerance: 0.5
        },
        arachnode: {
          enableRingZulu: true
          // Storage ring participation stub - will be added when arachnode is built
          // storageRing: config.profile === 'storage' ? { ring: 0 } : undefined
        }
      });

      instance.libp2pNode = node;

      // Create and initialize the StrandDatabase
      const strandDb = new StrandDatabase({
        strandId,
        sAppConfig,
        libp2pNode: node,
        coordinatedRepo: node.services.fret.repo
      });
      await strandDb.initialize();
      instance.database = strandDb;

      instance.status = 'active';
      instance.lastActivity = new Date();

      log('Strand %s started successfully with sApp %s', strandId, sAppConfig.id);
      return instance;

    } catch (error) {
      instance.status = 'error';
      instance.error = error instanceof Error ? error.message : String(error);
      log('Failed to start strand %s: %s', strandId, instance.error);
      throw error;
    }
  }

  /**
   * Stop a strand instance
   */
  async stopStrand(strandId: string): Promise<void> {
    const instance = this.instances.get(strandId);
    if (!instance) {
      log('Strand %s not found', strandId);
      return;
    }

    log('Stopping strand instance: %s', strandId);
    instance.status = 'stopping';

    try {
      // Close the database before stopping libp2p
      if (instance.database) {
        await instance.database.close();
        instance.database = undefined;
      }
      if (instance.libp2pNode) {
        await instance.libp2pNode.stop();
        instance.libp2pNode = undefined;
      }
      instance.status = 'stopped';
      this.instances.delete(strandId);
      log('Strand %s stopped successfully', strandId);
    } catch (error) {
      instance.status = 'error';
      instance.error = error instanceof Error ? error.message : String(error);
      log('Error stopping strand %s: %s', strandId, instance.error);
      throw error;
    }
  }

  /**
   * Stop all strand instances
   */
  async stopAll(): Promise<void> {
    this.stopping = true;
    log('Stopping all strand instances (%d)', this.instances.size);
    
    const stopPromises = Array.from(this.instances.keys()).map(id => 
      this.stopStrand(id).catch(err => {
        log('Error stopping strand %s during shutdown: %s', id, err);
      })
    );
    
    await Promise.all(stopPromises);
    this.stopping = false;
    log('All strand instances stopped');
  }
}

