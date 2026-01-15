import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HibernationManager, type HibernationCallbacks } from '../src/hibernation-manager.js';
import type { StrandInstance, HibernationConfig } from '../src/types.js';
import { HIBERNATION_TIMEOUTS } from '../src/types.js';

describe('HibernationManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createInstance(strandId: string, latencyHint: StrandInstance['latencyHint'] = 'interactive'): StrandInstance {
    return {
      strandId,
      status: 'active',
      connectedPeers: 0,
      lastActivity: new Date(),
      latencyHint
    };
  }

  function createCallbacks(): HibernationCallbacks & { 
    idleCalls: string[]; 
    hibernateCalls: string[];
    wakeCalls: string[];
  } {
    const callbacks = {
      idleCalls: [] as string[],
      hibernateCalls: [] as string[],
      wakeCalls: [] as string[],
      onIdle: vi.fn(async (strandId: string) => { callbacks.idleCalls.push(strandId); }),
      onHibernate: vi.fn(async (strandId: string) => { callbacks.hibernateCalls.push(strandId); }),
      onWake: vi.fn(async (strandId: string) => { callbacks.wakeCalls.push(strandId); })
    };
    return callbacks;
  }

  describe('constructor', () => {
    it('should create disabled manager by default', () => {
      const callbacks = createCallbacks();
      const manager = new HibernationManager({ enabled: false }, callbacks);
      
      const status = manager.getStatus();
      expect(status.enabled).toBe(false);
    });
  });

  describe('start/stop', () => {
    it('should start and stop cleanly', () => {
      const callbacks = createCallbacks();
      const manager = new HibernationManager({ enabled: true }, callbacks);
      
      manager.start();
      expect(manager.getStatus().enabled).toBe(true);
      
      manager.stop();
      expect(manager.getStatus().enabled).toBe(false);
    });
  });

  describe('tracking strands', () => {
    it('should not track when disabled', () => {
      const callbacks = createCallbacks();
      const manager = new HibernationManager({ enabled: false }, callbacks);
      manager.start();
      
      const instance = createInstance('strand-1');
      manager.trackStrand(instance);
      
      expect(manager.getStatus().trackedStrands).toBe(0);
      manager.stop();
    });

    it('should not track realtime strands', () => {
      const callbacks = createCallbacks();
      const manager = new HibernationManager({ enabled: true }, callbacks);
      manager.start();
      
      const instance = createInstance('strand-1', 'realtime');
      manager.trackStrand(instance);
      
      // Realtime strands never hibernate
      expect(manager.getStatus().trackedStrands).toBe(0);
      manager.stop();
    });

    it('should track non-realtime strands', () => {
      const callbacks = createCallbacks();
      const manager = new HibernationManager({ enabled: true }, callbacks);
      manager.start();
      
      const instance = createInstance('strand-1', 'interactive');
      manager.trackStrand(instance);
      
      expect(manager.getStatus().trackedStrands).toBe(1);
      manager.stop();
    });
  });

  describe('idle transitions', () => {
    it('should transition to idle after timeout', async () => {
      const callbacks = createCallbacks();
      const manager = new HibernationManager({ enabled: true }, callbacks);
      manager.start();
      
      const instance = createInstance('strand-1', 'interactive');
      manager.trackStrand(instance);
      
      // Fast forward past idle timeout
      const timeouts = HIBERNATION_TIMEOUTS.interactive;
      await vi.advanceTimersByTimeAsync(timeouts.idleTimeout + 100);
      
      expect(callbacks.idleCalls).toContain('strand-1');
      manager.stop();
    });

    it('should not transition realtime strands', async () => {
      const callbacks = createCallbacks();
      const manager = new HibernationManager({ enabled: true }, callbacks);
      manager.start();
      
      const instance = createInstance('strand-1', 'realtime');
      manager.trackStrand(instance);
      
      // Fast forward a long time
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // 1 hour
      
      expect(callbacks.idleCalls).not.toContain('strand-1');
      manager.stop();
    });
  });

  describe('activity recording', () => {
    it('should reset idle timer on activity', async () => {
      const callbacks = createCallbacks();
      const manager = new HibernationManager({ enabled: true }, callbacks);
      manager.start();
      
      const instance = createInstance('strand-1', 'interactive');
      manager.trackStrand(instance);
      
      const timeouts = HIBERNATION_TIMEOUTS.interactive;
      
      // Fast forward to just before idle timeout
      await vi.advanceTimersByTimeAsync(timeouts.idleTimeout - 1000);
      expect(callbacks.idleCalls).not.toContain('strand-1');
      
      // Record activity - should reset timer
      manager.recordActivity(instance);
      
      // Fast forward again to just before new idle timeout
      await vi.advanceTimersByTimeAsync(timeouts.idleTimeout - 1000);
      expect(callbacks.idleCalls).not.toContain('strand-1');
      
      manager.stop();
    });
  });
});

