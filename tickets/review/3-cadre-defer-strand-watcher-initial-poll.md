priority: 3
description: Defer StrandWatcher's first poll so it doesn't block CadreNode.start()
dependencies: none
files:
  - packages/cadre-core/src/strand-watcher.ts
  - packages/cadre-core/test/strand-watcher.spec.ts
  - packages/cadre-core/test/strand-watcher-filters.spec.ts
----

## Summary

`StrandWatcher.start()` no longer awaits the first `poll()` synchronously. Instead, it schedules a deferred poll via `setTimeout(..., 100)` after setting up the interval timer. This keeps `CadreNode.start()` fast — particularly on fresh cadres where no strands exist yet in the control database.

## Changes

### strand-watcher.ts
- Added `initialPollTimer` field to track the deferred first poll
- `start()`: replaced `await this.poll()` with `setTimeout(() => { void this.poll(); }, 100)`
- `stop()`: clears the `initialPollTimer` before the interval timer for clean resource cleanup
- The `running` flag guard in `poll()` provides a second safety net if `stop()` races with the deferred poll

### strand-watcher.spec.ts
- "should poll strands on start" replaced with "should not poll synchronously during start" — verifies start() returns before any poll fires
- Added "should detect strands after deferred first poll" — uses `forcePoll()` to verify detection still works
- Added "should cancel deferred poll when stop is called before it fires" — verifies clean stop
- Existing tests that depended on synchronous initial poll now use `forcePoll()` after `start()`

### strand-watcher-filters.spec.ts
- All tests updated to call `forcePoll()` after `start()` since the initial poll is now deferred

## Testing use cases

- `start()` resolves immediately without waiting for the first poll
- `forcePoll()` still works for explicit polling
- `stop()` before the deferred poll fires cancels it cleanly (no orphaned queries)
- Strand add/remove detection works correctly via `forcePoll()` after start
- All filter modes (all, none, strandId, sAppId) continue to work
- 127 tests pass, build clean
