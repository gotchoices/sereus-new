priority: 3
description: Defer StrandWatcher's first poll so it doesn't block CadreNode.start() — the initial poll queries the control database before any strands have been added via addStrand()
dependencies: none
files:
  - packages/cadre-core/src/strand-watcher.ts
  - packages/cadre-core/tests/strand-watcher.test.ts
----

## Context

`StrandWatcher.start()` (strand-watcher.ts line 152) immediately calls `await this.poll()` before setting up the interval timer. This blocks `CadreNode.start()` completion. On a fresh cadre where no strands exist yet in the control database (the common mobile case — the consumer calls `addStrand()` after start), this poll returns empty results and adds unnecessary latency.

Even when strands do exist, the poll triggers `onStrandAdded` callbacks that may start strand instances *during* start(), mixing strand initialization into the control-network start path. The `StrandWatcher` is designed to watch for changes over time — the first poll doesn't need to be synchronous.

## Change

Replace the immediate synchronous poll with a short-delayed first poll using `setTimeout`. This keeps `CadreNode.start()` fast while ensuring the watcher begins polling shortly after.

### strand-watcher.ts start() (lines 143–161)

Current:
```typescript
async start(): Promise<void> {
  // ...
  this.running = true;
  await this.poll();           // <-- blocks start()
  this.pollTimer = setInterval(() => {
    void this.poll();
  }, this.pollInterval);
}
```

Change to:
```typescript
async start(): Promise<void> {
  // ...
  this.running = true;
  this.pollTimer = setInterval(() => {
    void this.poll();
  }, this.pollInterval);
  // First poll runs after a short delay to avoid blocking the start path.
  // Strands added via addStrand() typically arrive after start() completes.
  setTimeout(() => { void this.poll(); }, 100);
}
```

The 100ms delay is short enough to feel instant to the user but keeps the main start() path unblocked. The `running` flag and guard in `poll()` already handle the case where `stop()` is called before the deferred poll fires.

## Tests

- Existing strand-watcher tests should still pass — the poll behavior is unchanged, just deferred
- `forcePoll()` is unaffected (still synchronous)
- Verify that `CadreNode.start()` resolves before the first poll fires
- The `handleStrandAdded` path still works correctly when the poll discovers strands after start

## TODO

- Modify StrandWatcher.start() to defer the first poll via setTimeout instead of awaiting it
- Update any tests that depend on strands being detected synchronously during start()
- Run build and tests
