import debug from 'debug';
import type { Libp2p, PeerId } from '@libp2p/interface';
import { createLibp2pNode } from '@optimystic/db-p2p';
import type { IRepo } from '@optimystic/db-core';
import type {
  CadreNodeConfig,
  StrandInstance,
  StrandRow,
  StrandConfig,
  SAppConfig,
  CadreNodeEvents
} from './types.js';
import { StrandWatcher, type StrandQueryable, type SAppIdLookup } from './strand-watcher.js';
import { StrandInstanceManager } from './strand-instance-manager.js';
import { EnrollmentService } from './enrollment.js';
import { HibernationManager, type HibernationCallbacks } from './hibernation-manager.js';
import { ControlDatabase } from './control-database.js';

const log = debug('sereus:cadre:node');

type EventHandler<T> = (data: T) => void;

/**
 * CadreNode is the main entry point for a cadre member.
 * It manages:
 * - Connection to the control network
 * - Watching for strand changes
 * - Starting/stopping strand instances
 * - Strand hibernation lifecycle
 * - Peer enrollment
 */
export class CadreNode implements SAppIdLookup {
  private readonly config: CadreNodeConfig;
  private controlNode: Libp2p | null = null;
  private controlDatabase: ControlDatabase | null = null;
  private strandWatcher: StrandWatcher | null = null;
  private strandManager: StrandInstanceManager;
  private hibernationManager: HibernationManager;
  private enrollmentService: EnrollmentService;
  private running = false;
  private eventHandlers: Map<keyof CadreNodeEvents, Set<EventHandler<any>>> = new Map();

  /** Map of strandId -> sAppConfig for sAppId filtering and management */
  private sAppConfigs: Map<string, SAppConfig> = new Map();

  constructor(config: CadreNodeConfig) {
    this.config = config;
    this.strandManager = new StrandInstanceManager();
    this.enrollmentService = new EnrollmentService();

    // Create hibernation manager with callbacks
    const hibernationCallbacks: HibernationCallbacks = {
      onIdle: async (strandId) => this.handleStrandIdle(strandId),
      onHibernate: async (strandId) => this.handleStrandHibernate(strandId),
      onWake: async (strandId) => this.handleStrandWake(strandId)
    };
    this.hibernationManager = new HibernationManager(
      config.hibernation ?? { enabled: false },
      hibernationCallbacks
    );

    log('CadreNode created for party: %s', config.controlNetwork.partyId);
  }

  /**
   * SAppIdLookup implementation - get sAppId for a strand
   */
  getSAppId(strandId: string): string | undefined {
    return this.sAppConfigs.get(strandId)?.id;
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

      // Extract coordinatedRepo from the node (attached by createLibp2pNode)
      const coordinatedRepo = (this.controlNode as any).coordinatedRepo as IRepo;
      if (!coordinatedRepo) {
        throw new Error('coordinatedRepo not available on control node');
      }

      // Initialize the control database with the libp2p node
      this.controlDatabase = new ControlDatabase({
        partyId: this.config.controlNetwork.partyId,
        libp2pNode: this.controlNode,
        coordinatedRepo,
        schemaPath: this.config.controlNetwork.schemaPath,
      });
      await this.controlDatabase.initialize();
      log('Control database initialized');

      // Create strand queryable using the control database
      const queryable = this.createStrandQueryable();

      // Create and start the strand watcher with sAppId lookup
      this.strandWatcher = new StrandWatcher(
        queryable,
        {
          onStrandAdded: async (strand) => this.handleStrandAdded(strand),
          onStrandRemoved: async (strandId) => this.handleStrandRemoved(strandId)
        },
        this.config.strandFilter ?? { mode: 'all' },
        this.config.strandWatchInterval ?? 5000,
        this // CadreNode implements SAppIdLookup
      );

      await this.strandWatcher.start();

      // Start hibernation manager
      this.hibernationManager.start();

      this.running = true;
      this.emit('control:connected', undefined);
      log('CadreNode started successfully');

      // Schedule self-registration in background
      this.scheduleSelfRegistration();

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

    // Determine relay mode: if explicitly set in config, use that;
    // otherwise default to true for storage profile nodes (better connectivity/uptime)
    const enableRelay = network?.enableRelay ?? (profile === 'storage');

    const nodeOptions: Parameters<typeof createLibp2pNode>[0] = {
      port: 0,
      bootstrapNodes: controlNetwork.bootstrapNodes,
      networkName: `control-${controlNetwork.partyId}`,
      storageType: storage?.type ?? 'memory',
      storagePath: storage?.path,
      fretProfile: profile === 'storage' ? 'core' : 'edge',
      relay: enableRelay,
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
    return {
      queryStrands: async (): Promise<StrandRow[]> => {
        if (!this.controlDatabase) {
          log('Control database not initialized, returning empty strands');
          return [];
        }
        log('Querying strands from control database');
        return await this.controlDatabase.queryStrands();
      }
    };
  }

  /**
   * Schedule self-registration in the CadrePeer table.
   * This runs as a background task after the node is started.
   */
  private scheduleSelfRegistration(): void {
    // Run in background - don't block start()
    setTimeout(async () => {
      try {
        await this.registerSelf();
      } catch (error) {
        log('Self-registration failed: %o', error);
        // Don't emit error event - this is a background task
        // The node can still function without self-registration
      }
    }, 1000); // Small delay to ensure node is fully started
  }

  /**
   * Register this peer in the CadrePeer table.
   * This allows other cadre members to discover this node.
   */
  private async registerSelf(): Promise<void> {
    if (!this.controlNode || !this.controlDatabase) {
      log('Cannot register self - node or database not initialized');
      return;
    }

    const peerId = this.controlNode.peerId.toString();
    const multiaddrs = this.controlNode.getMultiaddrs();

    if (multiaddrs.length === 0) {
      log('No multiaddrs available for self-registration');
      return;
    }

    // Use the first available multiaddr (typically the one with the peer ID)
    const multiaddr = multiaddrs[0]!.toString();

    log('Registering self: peerId=%s, multiaddr=%s', peerId, multiaddr);

    // TODO: This requires signing the update to satisfy the AuthorizedUpdate constraint
    // For now, we log what would happen. Full implementation requires:
    // 1. Either an authority key to authorize the insert
    // 2. Or the peer's private key to sign the update
    log('Self-registration requires authorization - skipping for now');
    // const db = this.controlDatabase.getDatabase();
    // await db.exec(
    //   'insert or replace into CadrePeer (PeerId, Multiaddr) values (?, ?)',
    //   [peerId, multiaddr]
    // );
  }

  private async handleStrandAdded(strand: StrandRow): Promise<void> {
    log('Handling strand added from control network: %s', strand.Id);

    // Check if we have sApp config for this strand
    const sAppConfig = this.sAppConfigs.get(strand.Id);
    if (!sAppConfig) {
      log('No sAppConfig registered for strand %s - skipping auto-start', strand.Id);
      // Strand detected in control network but not yet configured via addStrand
      // This is normal - the app will call addStrand with the config
      return;
    }

    try {
      const instance = await this.strandManager.startStrand({
        strandRow: strand,
        sAppConfig,
        storage: this.config.storage,
        network: this.config.network,
        profile: this.config.profile,
        defaultLatencyHint: this.config.hibernation?.defaultLatencyHint ?? 'interactive'
      });

      // Register with hibernation manager
      this.hibernationManager.trackStrand(instance);

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
      // Untrack from hibernation
      this.hibernationManager.untrackStrand(strandId);

      // Remove sApp config
      this.sAppConfigs.delete(strandId);

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
    // Stop hibernation manager
    this.hibernationManager.stop();

    // Stop strand watcher
    if (this.strandWatcher) {
      await this.strandWatcher.stop();
      this.strandWatcher = null;
    }

    // Stop all strand instances
    await this.strandManager.stopAll();

    // Clear sApp configs
    this.sAppConfigs.clear();

    // Close control database (this also shuts down the collection factory)
    if (this.controlDatabase) {
      await this.controlDatabase.close();
      this.controlDatabase = null;
    }

    // Stop control node
    if (this.controlNode) {
      await this.controlNode.stop();
      this.controlNode = null;
    }
  }

  // Hibernation callbacks
  private async handleStrandIdle(strandId: string): Promise<void> {
    const instance = this.strandManager.getInstance(strandId);
    if (instance) {
      instance.status = 'idle';
      log('Strand %s transitioned to idle', strandId);
      this.emit('strand:idle', { strandId });
    }
  }

  private async handleStrandHibernate(strandId: string): Promise<void> {
    const instance = this.strandManager.getInstance(strandId);
    if (instance) {
      instance.status = 'hibernating';

      // Optionally disconnect libp2p to save resources
      // For now we keep it connected but could stop it here
      log('Strand %s transitioned to hibernating', strandId);
      this.emit('strand:hibernating', { strandId });
    }
  }

  private async handleStrandWake(strandId: string): Promise<void> {
    const instance = this.strandManager.getInstance(strandId);
    if (instance) {
      instance.status = 'active';
      instance.lastActivity = new Date();
      log('Strand %s woke up', strandId);
      this.emit('strand:waking', { strandId });
    }
  }

  /**
   * Add a strand with its sApp configuration.
   * The hosting application must provide the sApp schema when creating a strand.
   */
  async addStrand(config: StrandConfig): Promise<StrandInstance> {
    if (!this.running) {
      throw new Error('CadreNode not running');
    }

    const { strandRow, sAppConfig } = config;

    // Store sApp config for this strand
    this.sAppConfigs.set(strandRow.Id, sAppConfig);
    log('Registered sAppConfig for strand %s (sApp: %s)', strandRow.Id, sAppConfig.id);

    const instance = await this.strandManager.startStrand({
      strandRow,
      sAppConfig,
      storage: this.config.storage,
      network: this.config.network,
      profile: this.config.profile,
      defaultLatencyHint: this.config.hibernation?.defaultLatencyHint ?? 'interactive'
    });

    // Register with hibernation manager
    this.hibernationManager.trackStrand(instance);

    this.emit('strand:started', { strandId: strandRow.Id });
    return instance;
  }

  /**
   * Remove a strand
   */
  async removeStrand(strandId: string): Promise<void> {
    if (!this.running) {
      throw new Error('CadreNode not running');
    }

    // Untrack from hibernation
    this.hibernationManager.untrackStrand(strandId);

    // Remove sApp config
    this.sAppConfigs.delete(strandId);

    await this.strandManager.stopStrand(strandId);
    this.emit('strand:stopped', { strandId });
  }

  /**
   * Record activity on a strand (resets hibernation timer)
   */
  recordStrandActivity(strandId: string): void {
    const instance = this.strandManager.getInstance(strandId);
    if (instance) {
      this.hibernationManager.recordActivity(instance);
    }
  }

  /**
   * Force wake a hibernating strand
   */
  async wakeStrand(strandId: string): Promise<void> {
    await this.hibernationManager.wakeStrand(strandId);
  }

  /**
   * Get the control network node (for advanced use)
   */
  getControlNode(): Libp2p | null {
    return this.controlNode;
  }

  /**
   * Get the control database (for advanced queries)
   */
  getControlDatabase(): ControlDatabase | null {
    return this.controlDatabase;
  }

  /**
   * Force a poll of the strand watcher (for testing)
   */
  async forceStrandPoll(): Promise<void> {
    await this.strandWatcher?.forcePoll();
  }

  /**
   * Get the sApp configuration for a strand
   */
  getSAppConfig(strandId: string): SAppConfig | undefined {
    return this.sAppConfigs.get(strandId);
  }
}

