priority: 4
description: E2E enrollment tests exercising seed bootstrap over real libp2p
----

## What was built

9 E2E integration tests covering the full enrollment lifecycle over real
libp2p nodes using `SeedBootstrapService`. Tests exercise seed creation,
validation, application, OOB encoding, invite flow, multi-node expansion,
and negative validation cases.

Two bugs in `seed-bootstrap.ts` were fixed during implementation:
- `LibP2PStream` interface and stream read/write code updated to libp2p v3.x
  API (`send()` instead of `sink()`, `AsyncIterable` instead of `stream.source`)
- `authorizePeer` passes empty string instead of null for NOT NULL
  `CadrePeer.Multiaddr` column

## Key files

- `packages/integration-tests/src/scenarios/enrollment-e2e.integration.ts` — test suite
- `packages/cadre-core/src/seed-bootstrap.ts` — implementation (with bug fixes)

## Test scenarios (9 tests, all passing)

1. **Seed creation + applySeed + dial** — authority creates seed, drone validates and connects
2. **addDrone helper with OOB encoding** — encode/decode roundtrip, connectivity, CadrePeer count
3. **Phone invite flow** — createInvite/dialInvite/acceptPhone, phone connectivity and CadrePeer entry
4. **Multi-node enrollment** — authority + 2 drones, 3-peer seed, all connected
5. **Tampered seed** — modified partyId rejected with "Invalid seed signature"
6. **Stripped authority info** — modified peers invalidate signature, rejected
7. **Expired invite (dialInvite)** — throws "Invite has expired"
8. **Expired invite (acceptPhone)** — throws "Invite has expired"
9. **Wrong invite token** — throws "Invalid invite token"

## Review notes

- Code is clean, DRY, and well-structured with shared test helpers
- Tests are independent (each creates own parties/services), good isolation
- Both positive and negative paths well covered
- Documentation in `docs/architecture.md` matches implementation
- Pre-existing `queryPeers()` dead code (`authorityKeys` set populated but unused) noted but not in scope
- `deliverSeed` protocol-level delivery not tested due to libp2p v3 stream negotiation issue — tracked in `tickets/fix/3-deliverSeed-libp2p-v3-stream-compat.md`

## Usage

```bash
yarn workspace @serfab/integration-tests test -- --testPathPattern enrollment-e2e
```
