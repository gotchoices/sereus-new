import { describe, it, expect } from 'vitest';
import { CadreNode } from '../src/cadre-node.js';
import type { CadreNodeConfig, StrandRow } from '../src/types.js';

describe('CadreNode', () => {
  // Helper to create test config
  function createConfig(overrides?: Partial<CadreNodeConfig>): CadreNodeConfig {
    return {
      controlNetwork: {
        partyId: 'test-party-' + Math.random().toString(36).slice(2),
        bootstrapNodes: []
      },
      profile: 'transaction',
      ...overrides
    };
  }

  // Helper to create test strand rows
  function createStrand(id: string): StrandRow {
    return { Id: id, MemberPrivateKey: null, Type: 'o' };
  }

  describe('constructor', () => {
    it('should create a node with minimal config', () => {
      const config = createConfig();
      const node = new CadreNode(config);

      expect(node.isRunning).toBe(false);
      expect(node.peerId).toBeUndefined();
    });

    it('should create a node with full config', () => {
      const config = createConfig({
        profile: 'storage',
        strandFilter: { mode: 'all' },
        storage: { type: 'memory' },
        hibernation: { enabled: true, defaultLatencyHint: 'interactive' },
        strandWatchInterval: 10000
      });

      const node = new CadreNode(config);
      expect(node.isRunning).toBe(false);
    });
  });

  describe('start/stop lifecycle', () => {
    it('should start and stop successfully', async () => {
      const config = createConfig();
      const node = new CadreNode(config);

      await node.start();

      expect(node.isRunning).toBe(true);
      expect(node.peerId).toBeDefined();
      expect(node.getControlNode()).toBeDefined();

      await node.stop();

      expect(node.isRunning).toBe(false);
    }, 30000);

    it('should handle multiple start calls', async () => {
      const config = createConfig();
      const node = new CadreNode(config);

      await node.start();
      await node.start(); // Should not throw

      expect(node.isRunning).toBe(true);

      await node.stop();
    }, 30000);

    it('should handle multiple stop calls', async () => {
      const config = createConfig();
      const node = new CadreNode(config);

      await node.start();
      await node.stop();
      await node.stop(); // Should not throw

      expect(node.isRunning).toBe(false);
    }, 30000);
  });

  describe('strand management', () => {
    it('should manually add and remove strands', async () => {
      const config = createConfig();
      const node = new CadreNode(config);

      await node.start();

      const strand = createStrand('manual-strand');
      const instance = await node.addStrand(strand);

      expect(instance.strandId).toBe('manual-strand');
      expect(node.getStrand('manual-strand')).toBeDefined();
      expect(node.getStrands().size).toBe(1);

      await node.removeStrand('manual-strand');

      expect(node.getStrand('manual-strand')).toBeUndefined();
      expect(node.getStrands().size).toBe(0);

      await node.stop();
    }, 60000);

    it('should reject strand operations when not running', async () => {
      const config = createConfig();
      const node = new CadreNode(config);

      await expect(node.addStrand(createStrand('test'))).rejects.toThrow('not running');
    });
  });

  describe('events', () => {
    it('should emit control:connected on start', async () => {
      const config = createConfig();
      const node = new CadreNode(config);

      let connected = false;
      node.on('control:connected', () => { connected = true; });

      await node.start();

      expect(connected).toBe(true);

      await node.stop();
    }, 30000);

    it('should emit control:disconnected on stop', async () => {
      const config = createConfig();
      const node = new CadreNode(config);

      let disconnected = false;
      node.on('control:disconnected', () => { disconnected = true; });

      await node.start();
      await node.stop();

      expect(disconnected).toBe(true);
    }, 30000);

    it('should emit strand:started when strand added', async () => {
      const config = createConfig();
      const node = new CadreNode(config);

      let startedId: string | null = null;
      node.on('strand:started', (data) => { startedId = data.strandId; });

      await node.start();
      await node.addStrand(createStrand('event-strand'));

      expect(startedId).toBe('event-strand');

      await node.stop();
    }, 60000);
  });

  describe('enrollment service', () => {
    it('should provide access to enrollment service', () => {
      const config = createConfig();
      const node = new CadreNode(config);

      const enrollment = node.getEnrollmentService();
      expect(enrollment).toBeDefined();
    });
  });
});

