priority: 3
description: Fixed deliverSeed handler signature and close-write for libp2p v3.x
files:
  - packages/cadre-core/src/seed-bootstrap.ts
  - packages/integration-tests/src/scenarios/deliver-seed-cross-network.integration.ts
  - packages/integration-tests/src/scenarios/enrollment-e2e.integration.ts
----

## What was built

Fixed two bugs in `SeedBootstrapService` that prevented `deliverSeed()` from working
with libp2p v3.x:

1. **Handler signature**: Changed from `({ stream, connection })` destructuring to
   `(rawStream, rawConnection)` separate args — matching libp2p v3.x `StreamHandler`.

2. **EOF signaling**: Replaced `closeWrite()` (doesn't exist in v3.x) with `close()`
   which closes the write end only. Error path uses `abort()` instead of double-close.

Interface cleanup: removed `IncomingStreamData` and `closeWrite?()` from `LibP2PStream`,
added `abort(err: Error): void`.

## Key files

- `packages/cadre-core/src/seed-bootstrap.ts` — handler at line 445, sender at line 292
- `packages/integration-tests/src/scenarios/deliver-seed-cross-network.integration.ts` — 5 tests (repro + fix + e2e)
- `packages/integration-tests/src/scenarios/enrollment-e2e.integration.ts` — 9 enrollment tests (unaffected, still pass)

## Testing

- 49/49 integration tests pass across 11 test files
- Build passes clean
- Tests cover: v3.x handler arg structure, broken pattern repro, correct round-trip,
  cross-network delivery, and full service-to-service e2e

## Usage

`deliverSeed()` works as documented — no API changes for callers:
```ts
const ack = await senderService.deliverSeed(receiverMultiaddr, seed);
// ack.accepted: boolean, ack.reason?: string
```
