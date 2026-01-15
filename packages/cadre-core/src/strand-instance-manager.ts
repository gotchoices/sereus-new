import debug from 'debug';
import type { Libp2p } from '@libp2p/interface';
import { createLibp2pNode } from '@optimystic/db-p2p';
import type { 
  StrandInstance, 
  StrandRow, 
  StorageConfig, 
  NetworkConfig,
  LatencyHint,
  NodeProfile
} from './types.js';

const log = debug('sereus:cadre:strand-manager');

/**
 * Configuration for starting a strand instance
 */
export interface StartStrandConfig {
  strandRow: StrandRow;
  storage?: StorageConfig;
  network?: NetworkConfig;
  profile: NodeProfile;
  defaultLatencyHint: LatencyHint;
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
    const { strandRow } = config;
    const strandId = strandRow.Id;

    if (this.stopping) {
      throw new Error('StrandInstanceManager is stopping');
    }

    if (this.instances.has(strandId)) {
      log('Strand %s already running', strandId);
      return this.instances.get(strandId)!;
    }

    log('Starting strand instance: %s', strandId);

    const instance: StrandInstance = {
      strandId,
      status: 'starting',
      memberPrivateKey: strandRow.MemberPrivateKey ?? undefined,
      connectedPeers: 0,
      lastActivity: new Date(),
      latencyHint: config.defaultLatencyHint
    };

    this.instances.set(strandId, instance);

    try {
      // Create isolated libp2p node for this strand
      const protocolPrefix = `/sereus/strand/${strandId}`;
      
      const node = await createLibp2pNode({
        port: 0, // Random port
        bootstrapNodes: [], // Will be populated from strand cohort
        networkName: `strand-${strandId}`,
        storageType: config.storage?.type ?? 'memory',
        storagePath: config.storage?.path,
        fretProfile: config.profile === 'storage' ? 'core' : 'edge',
        clusterSize: 3,
        clusterPolicy: {
          allowDownsize: true,
          sizeTolerance: 0.5
        },
        arachnode: {
          enableRingZulu: true
        }
      });

      instance.libp2pNode = node;
      instance.status = 'active';
      instance.lastActivity = new Date();

      log('Strand %s started successfully', strandId);
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

