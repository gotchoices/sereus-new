import { describe, it, expect } from 'vitest';
import { StrandInstanceManager } from '../src/strand-instance-manager.js';
import type { StrandRow } from '../src/types.js';

describe('StrandInstanceManager', () => {
  // Helper to create test strand rows
  function createStrand(id: string, type: 'o' | 'c' = 'o'): StrandRow {
    return {
      Id: id,
      MemberPrivateKey: type === 'c' ? 'test-key' : null,
      Type: type
    };
  }

  describe('constructor', () => {
    it('should create an empty manager', () => {
      const manager = new StrandInstanceManager();
      expect(manager.getInstances().size).toBe(0);
    });
  });

  describe('hasStrand', () => {
    it('should return false for non-existent strand', () => {
      const manager = new StrandInstanceManager();
      expect(manager.hasStrand('non-existent')).toBe(false);
    });
  });

  describe('getInstance', () => {
    it('should return undefined for non-existent strand', () => {
      const manager = new StrandInstanceManager();
      expect(manager.getInstance('non-existent')).toBeUndefined();
    });
  });

  describe('startStrand', () => {
    it('should start a strand instance', async () => {
      const manager = new StrandInstanceManager();
      const strand = createStrand('test-strand-1');

      const instance = await manager.startStrand({
        strandRow: strand,
        profile: 'transaction',
        defaultLatencyHint: 'interactive'
      });

      expect(instance.strandId).toBe('test-strand-1');
      expect(instance.status).toBe('active');
      expect(instance.latencyHint).toBe('interactive');
      expect(manager.hasStrand('test-strand-1')).toBe(true);

      // Cleanup
      await manager.stopAll();
    }, 30000);

    it('should return existing instance if already running', async () => {
      const manager = new StrandInstanceManager();
      const strand = createStrand('test-strand-2');

      const instance1 = await manager.startStrand({
        strandRow: strand,
        profile: 'transaction',
        defaultLatencyHint: 'interactive'
      });

      const instance2 = await manager.startStrand({
        strandRow: strand,
        profile: 'transaction',
        defaultLatencyHint: 'interactive'
      });

      expect(instance1).toBe(instance2);
      expect(manager.getInstances().size).toBe(1);

      await manager.stopAll();
    }, 30000);

    it('should track member private key for closed strands', async () => {
      const manager = new StrandInstanceManager();
      const strand = createStrand('closed-strand', 'c');

      const instance = await manager.startStrand({
        strandRow: strand,
        profile: 'transaction',
        defaultLatencyHint: 'background'
      });

      expect(instance.memberPrivateKey).toBe('test-key');

      await manager.stopAll();
    }, 30000);
  });

  describe('stopStrand', () => {
    it('should stop a running strand', async () => {
      const manager = new StrandInstanceManager();
      const strand = createStrand('strand-to-stop');

      await manager.startStrand({
        strandRow: strand,
        profile: 'transaction',
        defaultLatencyHint: 'interactive'
      });

      expect(manager.hasStrand('strand-to-stop')).toBe(true);

      await manager.stopStrand('strand-to-stop');

      expect(manager.hasStrand('strand-to-stop')).toBe(false);
    }, 30000);

    it('should handle stopping non-existent strand gracefully', async () => {
      const manager = new StrandInstanceManager();

      // Should not throw
      await manager.stopStrand('non-existent');
    });
  });

  describe('stopAll', () => {
    it('should stop all running strands', async () => {
      const manager = new StrandInstanceManager();

      await manager.startStrand({
        strandRow: createStrand('strand-a'),
        profile: 'transaction',
        defaultLatencyHint: 'interactive'
      });

      await manager.startStrand({
        strandRow: createStrand('strand-b'),
        profile: 'transaction',
        defaultLatencyHint: 'interactive'
      });

      expect(manager.getInstances().size).toBe(2);

      await manager.stopAll();

      expect(manager.getInstances().size).toBe(0);
    }, 60000);

    it('should handle empty manager', async () => {
      const manager = new StrandInstanceManager();

      // Should not throw
      await manager.stopAll();

      expect(manager.getInstances().size).toBe(0);
    });
  });
});

