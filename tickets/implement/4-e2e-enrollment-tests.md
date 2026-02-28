priority: 4
description: Implement E2E enrollment tests exercising seed bootstrap over real libp2p
dependencies: packages/integration-tests, packages/cadre-core (SeedBootstrapService, CadreNode)
files:
  - packages/integration-tests/src/scenarios/enrollment-e2e.integration.ts
  - packages/integration-tests/src/harness/test-network.ts (extend if needed)
  - packages/cadre-core/src/seed-bootstrap.ts
  - packages/cadre-core/src/cadre-node.ts
----

## Context

The existing `seed-bootstrap.integration.ts` tests SeedBootstrapService in isolation (authorize, create, encode/decode, validate). It does **not** exercise the full enrollment flow: seed delivery over `/sereus/seed/1.0.0`, applySeed on the receiving node, or post-enrollment control network sync.

The `websocket-chat.integration.ts` shows a CadreNode-level pattern (two nodes, same party, manual strand wiring) but uses WS transport and bypasses enrollment entirely.

These E2E enrollment tests close that gap by exercising real seed delivery and post-enrollment connectivity.

## Test Scenarios

### 1. Server adds drone via seed delivery protocol

Exercises the `/sereus/seed/1.0.0` protocol end-to-end:
- Authority node starts with ControlDatabase + SeedBootstrapService initialized
- Drone node starts blank (no partyId, no peers), listening on `/sereus/seed/1.0.0`
- Authority calls `authorizePeer(drone)` then `createSeed()` then `deliverSeed(droneAddr, seed)`
- Drone receives seed, validates signature, populates peer store, dials authority
- **Assert**: drone's `applySeed` returns `{ success: true }`; connection established between nodes; drone can query `CadrePeer` from the control network

### 2. Server adds drone via addDrone helper + out-of-band seed

Exercises `addDrone()` helper with `encodeSeed`/`decodeSeed` roundtrip:
- Authority calls `addDrone({ dronePeerId, droneMultiaddrs })`
- Encode seed → decode on drone side → `applySeed()`
- Drone dials authority using multiaddrs from seed
- **Assert**: connection established; seed signature is valid; `CadrePeer` table has both peers

### 3. Server invites phone (invite flow, no seed)

Exercises `createInvite`/`dialInvite` path:
- Server creates invite with token and expiration
- Phone decodes invite, dials server's authority address
- Server calls `acceptPhone({ phonePeerId, token })`
- **Assert**: phone is connected to server; server's `CadrePeer` table gains phone's entry

### 4. Multi-node enrollment (authority + 2 drones)

Tests cadre expansion:
- Authority starts, adds drone-1 (via seed delivery), adds drone-2 (via seed delivery)
- After both drones are enrolled, each drone's seed should reflect all 3 peers
- **Assert**: all 3 nodes connected; `CadrePeer` has 3 rows on authority; post-enrollment seed has 3 peers

### 5. Seed validation negative cases

- Tampered seed (modified partyId) → `applySeed` returns `{ success: false }`
- Seed with no authority peer → rejection
- Expired invite → `dialInvite` throws

## Implementation Notes

- Use the `TestCadreNetwork` harness for party creation (it provides real libp2p nodes + ControlDatabase)
- Create `SeedBootstrapService` instances per test, initialized against the party's libp2p + controlDatabase
- For the drone side, the drone's `TestCadreNode.libp2p` can be used to receive seeds (register the seed protocol handler by creating a second `SeedBootstrapService` on the drone)
- Tests 1-4 need real TCP connections (already working in the harness via ephemeral ports)
- Consider a shared helper `createSeedService(party: TestParty)` that extracts the private key and builds the service

## Assertion Points

| What | How |
|------|-----|
| Seed structure | `seed.partyId`, `seed.peers.length`, `seed.signature` defined |
| Seed signature | `validateSeedSignature(seed) === true` |
| Seed delivery ack | `deliverSeed()` returns `{ accepted: true }` |
| Post-seed connectivity | `libp2p.getConnections().length >= 1` within timeout |
| CadrePeer convergence | `select count(*) from CadreControl.CadrePeer` matches expected |
| Invite expiry | `dialInvite(expiredInvite)` throws |
| Tampered seed | `applySeed(tampered)` returns `{ success: false }` |

## TODO

- [ ] Create `enrollment-e2e.integration.ts` in `packages/integration-tests/src/scenarios/`
- [ ] Add shared helper `createSeedService(party)` in harness (or in the test file if small)
- [ ] Implement test: server adds drone via seed delivery protocol
- [ ] Implement test: server adds drone via addDrone helper + OOB seed
- [ ] Implement test: server invites phone (invite flow)
- [ ] Implement test: multi-node enrollment (3 nodes)
- [ ] Implement test: seed validation negative cases
- [ ] Verify all tests pass (`yarn test` in integration-tests)
