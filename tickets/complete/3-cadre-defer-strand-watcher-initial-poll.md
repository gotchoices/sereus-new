priority: 3
description: Defer StrandWatcher's first poll so it doesn't block CadreNode.start()
files:
  - packages/cadre-core/src/strand-watcher.ts
  - packages/cadre-core/test/strand-watcher.spec.ts
  - packages/cadre-core/test/strand-watcher-filters.spec.ts
  - docs/cadre-architecture.md
----

## What was built

`StrandWatcher.start()` no longer awaits a synchronous first `poll()`. Instead, it schedules a deferred poll via `setTimeout(..., 100)` after setting up the interval timer. This keeps `CadreNode.start()` fast, especially on fresh cadres with no strands yet.

Key changes:
- `start()` sets `running = true`, creates the interval timer, then schedules the first poll via `setTimeout` (100ms)
- `stop()` clears the deferred poll timer before the interval timer, nulls both
- `poll()` guards on `this.running` as a safety net against races
- `forcePoll()` remains available for explicit polling in tests and via `CadreNode.forceStrandPoll()`

## Testing

127 tests pass across cadre-core. Specific coverage for this change:

- `start()` resolves without triggering any poll (verified via zero `addedStrands`)
- `forcePoll()` works for explicit strand detection after start
- `stop()` before the deferred poll fires cancels it cleanly (pollCount stays 0)
- All filter modes (all, none, strandId, sAppId) continue to work with `forcePoll()` after start
- Strand add/remove detection works correctly via `forcePoll()`

## Review notes

- No resource leaks: both timers are cleared in `stop()`, `initialPollTimer` is also self-nulled after firing
- Race safety: `running` flag guard in `poll()` prevents execution if `stop()` raced with the deferred timer
- `start()` is still `async` for API compatibility even though it no longer awaits internally
- Updated test count in cadre-architecture.md from 117 to 127
