import debug from 'debug';
import type { Libp2p, PeerId } from '@libp2p/interface';
import { privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import { createLibp2pNode } from '@optimystic/db-p2p';
import type {
  CadreNodeConfig,
  StrandInstance,
  StrandRow,
  CadreNodeEvents
} from './types';
import { StrandWatcher, type StrandQueryable } from './strand-watcher';
import { StrandInstanceManager } from './strand-instance-manager';
import { EnrollmentService } from './enrollment';

const log = debug('sereus:cadre:node');

type EventHandler<T> = (data: T) => void;

/**
 * CadreNode is the main entry point for a cadre member.
 * It manages:
 * - Connection to the control network
 * - Watching for strand changes
 * - Starting/stopping strand instances
 * - Peer enrollment
 */
export class CadreNode {
  private readonly config: CadreNodeConfig;
  private controlNode: Libp2p | null = null;
  private strandWatcher: StrandWatcher | null = null;
  private strandManager: StrandInstanceManager;
  private enrollmentService: EnrollmentService;
  private running = false;
  private eventHandlers: Map<keyof CadreNodeEvents, Set<EventHandler<any>>> = new Map();

  constructor(config: CadreNodeConfig) {
    this.config = config;
    this.strandManager = new StrandInstanceManager();
    this.enrollmentService = new EnrollmentService();
    log('CadreNode created for party: %s', config.controlNetwork.partyId);
  }

  /**
   * Get the peer ID of this node (available after start)
   */
  get peerId(): PeerId | undefined {
    return this.controlNode?.peerId;
  }

  /**
   * Check if the node is running
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Get all strand instances
   */
  getStrands(): Map<string, StrandInstance> {
    return this.strandManager.getInstances();
  }

  /**
   * Get a specific strand instance
   */
  getStrand(strandId: string): StrandInstance | undefined {
    return this.strandManager.getInstance(strandId);
  }

  /**
   * Get the enrollment service for adding new peers
   */
  getEnrollmentService(): EnrollmentService {
    return this.enrollmentService;
  }

  /**
   * Start the cadre node
   */
  async start(): Promise<void> {
    if (this.running) {
      log('CadreNode already running');
      return;
    }

    log('Starting CadreNode for party: %s', this.config.controlNetwork.partyId);

    try {
      // Create the control network libp2p node
      this.controlNode = await this.createControlNode();
      log('Control node started with ID: %s', this.controlNode.peerId.toString());

      // Create strand queryable (mock for now - will use actual DB query)
      const queryable = this.createStrandQueryable();

      // Create and start the strand watcher
      this.strandWatcher = new StrandWatcher(
        queryable,
        {
          onStrandAdded: async (strand) => this.handleStrandAdded(strand),
          onStrandRemoved: async (strandId) => this.handleStrandRemoved(strandId)
        },
        this.config.strandFilter ?? { mode: 'all' },
        this.config.strandWatchInterval ?? 5000
      );

      await this.strandWatcher.start();
      
      this.running = true;
      this.emit('control:connected', undefined);
      log('CadreNode started successfully');

    } catch (error) {
      log('Failed to start CadreNode: %o', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the cadre node
   */
  async stop(): Promise<void> {
    if (!this.running) {
      log('CadreNode not running');
      return;
    }

    log('Stopping CadreNode');
    await this.cleanup();
    this.running = false;
    this.emit('control:disconnected', undefined);
    log('CadreNode stopped');
  }

  /**
   * Subscribe to events
   */
  on<K extends keyof CadreNodeEvents>(
    event: K, 
    handler: EventHandler<CadreNodeEvents[K]>
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unsubscribe from events
   */
  off<K extends keyof CadreNodeEvents>(
    event: K, 
    handler: EventHandler<CadreNodeEvents[K]>
  ): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private emit<K extends keyof CadreNodeEvents>(
    event: K, 
    data: CadreNodeEvents[K]
  ): void {
    this.eventHandlers.get(event)?.forEach(handler => {
      try { handler(data); } catch (e) { log('Event handler error: %o', e); }
    });
  }

  private async createControlNode(): Promise<Libp2p> {
    const { controlNetwork, network, storage, profile, privateKey } = this.config;
    const protocolPrefix = `/sereus/control/${controlNetwork.partyId}`;

    const nodeOptions: Parameters<typeof createLibp2pNode>[0] = {
      port: 0,
      bootstrapNodes: controlNetwork.bootstrapNodes,
      networkName: `control-${controlNetwork.partyId}`,
      storageType: storage?.type ?? 'memory',
      storagePath: storage?.path,
      fretProfile: profile === 'storage' ? 'core' : 'edge',
      clusterSize: 3,
      clusterPolicy: { allowDownsize: true, sizeTolerance: 0.5 },
      arachnode: { enableRingZulu: true }
    };

    // If private key provided, we need to load it
    // Note: createLibp2pNode doesn't support privateKey directly yet
    // For now we create the node without it
    if (privateKey) {
      log('Private key provided - loading identity');
      // This would need to be integrated into createLibp2pNode
    }

    return await createLibp2pNode(nodeOptions);
  }

  private createStrandQueryable(): StrandQueryable {
    // This is a placeholder implementation
    // In a real implementation, this would query the CadreControl schema
    // via the Quereus database on the control network
    return {
      queryStrands: async (): Promise<StrandRow[]> => {
        // TODO: Implement actual query against control network database
        // For now, return empty array - strands will be added via other means
        log('Querying strands from control network (stub implementation)');
        return [];
      }
    };
  }

  private async handleStrandAdded(strand: StrandRow): Promise<void> {
    log('Handling strand added: %s', strand.Id);

    try {
      await this.strandManager.startStrand({
        strandRow: strand,
        storage: this.config.storage,
        network: this.config.network,
        profile: this.config.profile,
        defaultLatencyHint: this.config.hibernation?.defaultLatencyHint ?? 'interactive'
      });

      this.emit('strand:started', { strandId: strand.Id });
    } catch (error) {
      log('Error starting strand %s: %o', strand.Id, error);
      this.emit('strand:error', {
        strandId: strand.Id,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  private async handleStrandRemoved(strandId: string): Promise<void> {
    log('Handling strand removed: %s', strandId);

    try {
      await this.strandManager.stopStrand(strandId);
      this.emit('strand:stopped', { strandId });
    } catch (error) {
      log('Error stopping strand %s: %o', strandId, error);
      this.emit('strand:error', {
        strandId,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  private async cleanup(): Promise<void> {
    // Stop strand watcher
    if (this.strandWatcher) {
      await this.strandWatcher.stop();
      this.strandWatcher = null;
    }

    // Stop all strand instances
    await this.strandManager.stopAll();

    // Stop control node
    if (this.controlNode) {
      await this.controlNode.stop();
      this.controlNode = null;
    }
  }

  /**
   * Manually add a strand (for testing or direct API use)
   */
  async addStrand(strand: StrandRow): Promise<StrandInstance> {
    if (!this.running) {
      throw new Error('CadreNode not running');
    }

    const instance = await this.strandManager.startStrand({
      strandRow: strand,
      storage: this.config.storage,
      network: this.config.network,
      profile: this.config.profile,
      defaultLatencyHint: this.config.hibernation?.defaultLatencyHint ?? 'interactive'
    });

    this.emit('strand:started', { strandId: strand.Id });
    return instance;
  }

  /**
   * Manually remove a strand (for testing or direct API use)
   */
  async removeStrand(strandId: string): Promise<void> {
    if (!this.running) {
      throw new Error('CadreNode not running');
    }

    await this.strandManager.stopStrand(strandId);
  }

  /**
   * Get the control network node (for advanced use)
   */
  getControlNode(): Libp2p | null {
    return this.controlNode;
  }

  /**
   * Force a poll of the strand watcher (for testing)
   */
  async forceStrandPoll(): Promise<void> {
    await this.strandWatcher?.forcePoll();
  }
}

