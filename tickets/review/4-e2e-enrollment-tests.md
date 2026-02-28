priority: 4
description: E2E enrollment tests exercising seed bootstrap over real libp2p
dependencies: packages/integration-tests, packages/cadre-core (SeedBootstrapService)
files:
  - packages/integration-tests/src/scenarios/enrollment-e2e.integration.ts
  - packages/cadre-core/src/seed-bootstrap.ts
----

## Summary

Implemented 9 E2E integration tests covering the full enrollment lifecycle
over real libp2p nodes: seed creation/validation/application, addDrone helper
with OOB encoding, invite flow for phones, multi-node cadre expansion, and
negative validation cases.

Also fixed two bugs in `seed-bootstrap.ts` discovered during implementation:
- Updated `LibP2PStream` interface and all stream read/write code to libp2p v3.x
  API (send() instead of sink(), AsyncIterable instead of stream.source)
- Fixed `authorizePeer` to pass empty string instead of null for NOT NULL
  CadrePeer.Multiaddr column

## Test Scenarios

### 1. Drone enrollment via seed creation + applySeed + dial
- Authority creates seed with authorized peers, drone validates signature,
  applies seed (populates peer store), and dials authority
- Asserts: seed structure, signature validity, peer connectivity

### 2. addDrone helper with OOB seed encoding
- Authority calls addDrone → encode → drone decodes → applySeed → connects
- Asserts: encode/decode roundtrip, signature, connectivity, CadrePeer count

### 3. Phone invite flow (createInvite/dialInvite)
- Server creates invite, phone decodes and dials, server accepts phone
- Asserts: invite structure, phone connectivity, CadrePeer entry for phone

### 4. Multi-node enrollment (authority + 2 drones)
- Authority enrolls drone-1, then drone-2 (seed2 includes all 3 peers)
- Asserts: 3-peer seed, all nodes connected, CadrePeer has 3 rows

### 5. Negative cases (5 tests)
- Tampered seed (modified partyId) → rejected with "Invalid seed signature"
- Stripped authority info → rejected (signature/authority check fails)
- Expired invite → dialInvite throws "Invite has expired"
- Expired invite via acceptPhone → throws "Invite has expired"
- Wrong invite token → throws "Invalid invite token"

## Known Limitation

`deliverSeed` (protocol-level `/sereus/seed/1.0.0` delivery) is not exercised
due to a cross-network libp2p v3 stream negotiation issue. Tracked in
`tickets/fix/3-deliverSeed-libp2p-v3-stream-compat.md`. Tests use `applySeed`
+ `dial` instead, which exercises the same enrollment logic without the
framing protocol.

## Test Results

All 9 enrollment tests pass. All 122 cadre-core tests pass. All other
integration tests pass (except pre-existing websocket-chat schema signature
issue).

## Usage

```bash
yarn workspace @serfab/integration-tests test -- --testPathPattern enrollment-e2e
```
