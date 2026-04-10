priority: 3
description: Fix deliverSeed handler signature and close-write for libp2p v3.x
dependencies: packages/cadre-core (SeedBootstrapService)
files:
  - packages/cadre-core/src/seed-bootstrap.ts
  - packages/integration-tests/src/scenarios/deliver-seed-cross-network.integration.ts
  - packages/integration-tests/src/scenarios/enrollment-e2e.integration.ts
----

## Summary

Fixed two bugs in `SeedBootstrapService` that prevented `deliverSeed()` from working
with libp2p v3.x:

### Bug 1: Handler signature mismatch (seed-bootstrap.ts:445)
libp2p v3.x `StreamHandler` passes `(stream, connection)` as two separate arguments.
The handler destructured `{ stream, connection }` from a single argument, causing both
to be `undefined` and the handler to throw, resetting the stream.

**Fix**: Changed handler from `async (data: unknown) => { const { stream, connection } = data as IncomingStreamData; }`
to `async (rawStream: unknown, rawConnection: unknown) => { const stream = rawStream as LibP2PStream; ... }`.

### Bug 2: closeWrite() doesn't exist in v3.x (seed-bootstrap.ts:330)
In libp2p v3.x, `stream.close()` closes the write end only (read remains open).
There is no `closeWrite()`. The conditional `if (stream.closeWrite) { ... }` was
always skipped, so the sender never signaled EOF, causing the receiver's
`for await` loop to hang forever.

**Fix**: Replaced `if (stream.closeWrite) { ... }` with `await stream.close()`.
Changed `finally { await stream.close() }` to `catch (err) { stream.abort(err); throw err; }`
since the write end is already closed by `close()` and we only need abort on error.

### Interface cleanup
- Removed `IncomingStreamData` interface (no longer needed)
- Removed `closeWrite?()` from `LibP2PStream` interface
- Added `abort(err: Error): void` to `LibP2PStream` interface

## Test coverage

- **Existing repro tests** (4 tests): Verify v3.x handler arg structure, demonstrate
  the old broken pattern, and test correct v3.x protocol round-trips including
  cross-network (network-scoped sender -> plain receiver).
- **New e2e test**: `e2e: deliverSeed round-trips through service handler on both sides` —
  exercises the actual `SeedBootstrapService.deliverSeed()` sender calling a
  `SeedBootstrapService` receiver (both using the fixed code paths).
- **All 46 integration tests pass** (10 test files), including enrollment e2e tests
  that use `applySeed` (unaffected by this change).

## Validation checklist

- [ ] Handler receives `(stream, connection)` as separate args, not `{ stream, connection }`
- [ ] `deliverSeed()` calls `stream.close()` to signal EOF (not `closeWrite()`)
- [ ] Error path uses `stream.abort()` instead of double-closing
- [ ] `LibP2PStream` interface matches v3.x API surface
- [ ] Cross-network delivery works (different network scopes)
- [ ] Same-network delivery works
- [ ] Enrollment e2e tests still pass (applySeed path)
- [ ] Build passes with no type errors
