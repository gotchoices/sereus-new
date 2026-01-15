import { describe, it, expect } from 'vitest';
import { StrandWatcher, type StrandQueryable, type StrandWatcherCallbacks } from '../src/strand-watcher.js';
import type { StrandRow } from '../src/types.js';

describe('StrandWatcher Filters', () => {
  function createMockQueryable(strandsProvider: () => StrandRow[]): StrandQueryable {
    return {
      queryStrands: async () => strandsProvider()
    };
  }

  function createStrand(id: string): StrandRow {
    return { Id: id, MemberPrivateKey: null, Type: 'o' };
  }

  describe('mode: all', () => {
    it('should pass all strands through', async () => {
      const strands = [
        createStrand('strand-1'),
        createStrand('strand-2'),
        createStrand('strand-3')
      ];
      const queryable = createMockQueryable(() => strands);

      const addedStrands: StrandRow[] = [];
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async (strand) => { addedStrands.push(strand); },
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(queryable, callbacks, { mode: 'all' }, 60000);
      await watcher.start();

      expect(addedStrands).toHaveLength(3);

      await watcher.stop();
    });
  });

  describe('mode: none', () => {
    it('should filter out all strands', async () => {
      const strands = [
        createStrand('strand-1'),
        createStrand('strand-2')
      ];
      const queryable = createMockQueryable(() => strands);

      const addedStrands: StrandRow[] = [];
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async (strand) => { addedStrands.push(strand); },
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(queryable, callbacks, { mode: 'none' }, 60000);
      await watcher.start();

      expect(addedStrands).toHaveLength(0);

      await watcher.stop();
    });
  });

  describe('mode: strandId', () => {
    it('should only pass through matching strand', async () => {
      const strands = [
        createStrand('strand-1'),
        createStrand('target-strand'),
        createStrand('strand-3')
      ];
      const queryable = createMockQueryable(() => strands);

      const addedStrands: StrandRow[] = [];
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async (strand) => { addedStrands.push(strand); },
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(
        queryable,
        callbacks,
        { mode: 'strandId', strandId: 'target-strand' },
        60000
      );
      await watcher.start();

      expect(addedStrands).toHaveLength(1);
      expect(addedStrands[0]!.Id).toBe('target-strand');

      await watcher.stop();
    });

    it('should not pass through non-matching strands', async () => {
      const strands = [
        createStrand('strand-1'),
        createStrand('strand-2')
      ];
      const queryable = createMockQueryable(() => strands);

      const addedStrands: StrandRow[] = [];
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async (strand) => { addedStrands.push(strand); },
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(
        queryable,
        callbacks,
        { mode: 'strandId', strandId: 'non-existent' },
        60000
      );
      await watcher.start();

      expect(addedStrands).toHaveLength(0);

      await watcher.stop();
    });
  });

  describe('mode: sAppId', () => {
    // Note: sAppId filtering requires strand header which isn't available in StrandRow
    // Currently passes all strands through (to be filtered by StrandInstanceManager)
    it('should pass strands through for later filtering', async () => {
      const strands = [createStrand('strand-1'), createStrand('strand-2')];
      const queryable = createMockQueryable(() => strands);

      const addedStrands: StrandRow[] = [];
      const callbacks: StrandWatcherCallbacks = {
        onStrandAdded: async (strand) => { addedStrands.push(strand); },
        onStrandRemoved: async () => {}
      };

      const watcher = new StrandWatcher(
        queryable,
        callbacks,
        { mode: 'sAppId', sAppId: 'some-app' },
        60000
      );
      await watcher.start();

      // Currently all strands pass through for sAppId mode
      expect(addedStrands.length).toBeGreaterThan(0);

      await watcher.stop();
    });
  });
});

