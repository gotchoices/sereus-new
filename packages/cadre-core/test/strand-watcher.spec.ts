import { describe, it, expect, vi, afterEach } from 'vitest';
import { StrandWatcher, type StrandQueryable, type StrandWatcherCallbacks } from '../src/strand-watcher.js';
import type { StrandRow } from '../src/types.js';

describe('StrandWatcher', () => {
  // Mock queryable that returns configurable strands
  function createMockQueryable(strandsProvider: () => StrandRow[]): StrandQueryable {
    return {
      queryStrands: async () => strandsProvider()
    };
  }

  // Helper to create test strand rows
  function createStrand(id: string, type: 'o' | 'c' = 'o'): StrandRow {
    return {
      Id: id,
      MemberPrivateKey: type === 'c' ? 'test-key' : null,
      Type: type
    };
  }

  describe('constructor', () => {
    it('should create a watcher with default filter', () => {
      const queryable = createMockQueryable(() => []);
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async () => {},
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(queryable, callbacks);
      expect(watcher.getKnownStrands().size).toBe(0);
    });

    it('should accept custom filter and poll interval', () => {
      const queryable = createMockQueryable(() => []);
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async () => {},
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(
        queryable,
        callbacks,
        { mode: 'strandId', strandId: 'specific-strand' },
        1000
      );
      expect(watcher).toBeInstanceOf(StrandWatcher);
    });
  });

  describe('start/stop', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should not poll synchronously during start', async () => {
      const strands = [createStrand('strand-1'), createStrand('strand-2')];
      const queryable = createMockQueryable(() => strands);

      const addedStrands: StrandRow[] = [];
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async (strand) => { addedStrands.push(strand); },
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(queryable, callbacks, { mode: 'all' }, 60000);
      await watcher.start();

      expect(addedStrands).toHaveLength(0);
      expect(watcher.getKnownStrands().size).toBe(0);

      await watcher.stop();
    });

    it('should detect strands after deferred first poll', async () => {
      const strands = [createStrand('strand-1'), createStrand('strand-2')];
      const queryable = createMockQueryable(() => strands);

      const addedStrands: StrandRow[] = [];
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async (strand) => { addedStrands.push(strand); },
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(queryable, callbacks, { mode: 'all' }, 60000);
      await watcher.start();
      await watcher.forcePoll();

      expect(addedStrands).toHaveLength(2);
      expect(watcher.getKnownStrands().size).toBe(2);

      await watcher.stop();
    });

    it('should clear known strands on stop', async () => {
      const strands = [createStrand('strand-1')];
      const queryable = createMockQueryable(() => strands);

      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async () => {},
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(queryable, callbacks, { mode: 'all' }, 60000);
      await watcher.start();
      await watcher.forcePoll();
      expect(watcher.getKnownStrands().size).toBe(1);

      await watcher.stop();
      expect(watcher.getKnownStrands().size).toBe(0);
    });

    it('should cancel deferred poll when stop is called before it fires', async () => {
      let pollCount = 0;
      const queryable: StrandQueryable = {
        queryStrands: async () => { pollCount++; return []; }
      };
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async () => {},
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(queryable, callbacks, { mode: 'all' }, 60000);
      await watcher.start();
      await watcher.stop();

      expect(pollCount).toBe(0);
    });
  });

  describe('strand detection', () => {
    it('should detect added strands', async () => {
      let strands: StrandRow[] = [];
      const queryable = createMockQueryable(() => strands);

      const addedStrands: StrandRow[] = [];
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async (strand) => { addedStrands.push(strand); },
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(queryable, callbacks, { mode: 'all' }, 60000);
      await watcher.start();
      expect(addedStrands).toHaveLength(0);

      // Add a strand
      strands = [createStrand('new-strand')];
      await watcher.forcePoll();

      expect(addedStrands).toHaveLength(1);
      expect(addedStrands[0]!.Id).toBe('new-strand');

      await watcher.stop();
    });

    it('should detect removed strands', async () => {
      let strands = [createStrand('strand-to-remove')];
      const queryable = createMockQueryable(() => strands);

      const removedIds: string[] = [];
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async () => {},
        onStrandRemoved: async (id) => { removedIds.push(id); }
      };

      const watcher = new StrandWatcher(queryable, callbacks, { mode: 'all' }, 60000);
      await watcher.start();
      await watcher.forcePoll();

      // Remove the strand
      strands = [];
      await watcher.forcePoll();

      expect(removedIds).toHaveLength(1);
      expect(removedIds[0]).toBe('strand-to-remove');

      await watcher.stop();
    });

    it('should not trigger callback for unchanged strands', async () => {
      const strands = [createStrand('stable-strand')];
      const queryable = createMockQueryable(() => strands);

      let addCount = 0;
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async () => { addCount++; },
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(queryable, callbacks, { mode: 'all' }, 60000);
      await watcher.start();
      await watcher.forcePoll();
      expect(addCount).toBe(1);

      // Poll again - should not trigger another add
      await watcher.forcePoll();
      expect(addCount).toBe(1);

      await watcher.stop();
    });
  });
});

