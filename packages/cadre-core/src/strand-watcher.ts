import debug from 'debug';
import type { StrandFilter, StrandRow } from './types.js';

const log = debug('sereus:cadre:strand-watcher');

/**
 * Callback for strand changes
 */
export interface StrandWatcherCallbacks {
  onStrandAdded: (strand: StrandRow) => Promise<void>;
  onStrandRemoved: (strandId: string) => Promise<void>;
}

/**
 * Interface for querying strands from control network
 */
export interface StrandQueryable {
  queryStrands(): Promise<StrandRow[]>;
}

/**
 * Watches the control network's Strand table for changes and triggers
 * strand instance start/stop via callbacks.
 * 
 * Uses polling until Optimystic supports reactive subscriptions.
 */
export class StrandWatcher {
  private readonly filter: StrandFilter;
  private readonly pollInterval: number;
  private readonly callbacks: StrandWatcherCallbacks;
  private readonly queryable: StrandQueryable;
  
  private knownStrands: Map<string, StrandRow> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    queryable: StrandQueryable,
    callbacks: StrandWatcherCallbacks,
    filter: StrandFilter = { mode: 'all' },
    pollInterval: number = 5000
  ) {
    this.queryable = queryable;
    this.callbacks = callbacks;
    this.filter = filter;
    this.pollInterval = pollInterval;
    log('StrandWatcher created with filter: %o, interval: %dms', filter, pollInterval);
  }

  /**
   * Check if a strand passes the current filter
   */
  private passesFilter(strand: StrandRow): boolean {
    switch (this.filter.mode) {
      case 'all':
        return true;
      case 'none':
        return false;
      case 'strandId':
        return strand.Id === this.filter.strandId;
      case 'appId':
        // For appId filtering, we'd need the strand header which contains AppId
        // For now, we pass all strands through - the StrandInstanceManager 
        // will fetch the header and filter there if needed
        log('appId filter not fully implemented - passing strand %s', strand.Id);
        return true;
      default:
        return true;
    }
  }

  /**
   * Poll for strand changes
   */
  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const currentStrands = await this.queryable.queryStrands();
      const currentMap = new Map(currentStrands.map(s => [s.Id, s]));

      // Find added strands
      for (const strand of currentStrands) {
        if (!this.knownStrands.has(strand.Id) && this.passesFilter(strand)) {
          log('Strand added: %s', strand.Id);
          this.knownStrands.set(strand.Id, strand);
          try {
            await this.callbacks.onStrandAdded(strand);
          } catch (error) {
            log('Error handling strand add for %s: %o', strand.Id, error);
          }
        }
      }

      // Find removed strands
      for (const [strandId] of this.knownStrands) {
        if (!currentMap.has(strandId)) {
          log('Strand removed: %s', strandId);
          this.knownStrands.delete(strandId);
          try {
            await this.callbacks.onStrandRemoved(strandId);
          } catch (error) {
            log('Error handling strand remove for %s: %o', strandId, error);
          }
        }
      }
    } catch (error) {
      log('Error polling strands: %o', error);
    }
  }

  /**
   * Start watching for strand changes
   */
  async start(): Promise<void> {
    if (this.running) {
      log('StrandWatcher already running');
      return;
    }

    log('Starting StrandWatcher');
    this.running = true;

    // Do an initial poll immediately
    await this.poll();

    // Set up periodic polling
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollInterval);

    log('StrandWatcher started');
  }

  /**
   * Stop watching for strand changes
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    log('Stopping StrandWatcher');
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.knownStrands.clear();
    log('StrandWatcher stopped');
  }

  /**
   * Get currently known strands
   */
  getKnownStrands(): Map<string, StrandRow> {
    return new Map(this.knownStrands);
  }

  /**
   * Force an immediate poll (useful for testing)
   */
  async forcePoll(): Promise<void> {
    await this.poll();
  }
}

