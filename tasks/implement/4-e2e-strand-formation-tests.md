priority: 4
description: Implement E2E strand formation tests exercising strand-proto bootstrap over real libp2p
dependencies: packages/integration-tests, packages/cadre-core (StrandSolicitationService, StrandFormationManager, CadreNode), packages/strand-proto
files:
  - packages/integration-tests/src/scenarios/strand-formation-e2e.integration.ts
  - packages/integration-tests/src/harness/test-network.ts (wire joinStrand to real protocol)
  - packages/cadre-core/src/strand-solicitation.ts
  - packages/cadre-core/src/strand-formation-manager.ts
  - packages/strand-proto/src/bootstrap.ts
  - packages/cadre-core/src/cadre-node.ts
----

## Context

The `TestCadreNetwork.joinStrand()` is currently a stub — it pushes the joiner's partyId into the local `strand.parties` array but does not execute the `/sereus/bootstrap/1.0.0` protocol or insert Strand rows in the joiner's control DB.

The `happy-path.integration.ts` creates strands and invitations but relies on this stub. The `websocket-chat.integration.ts` bypasses formation entirely by manually calling `addStrand()` on both nodes.

These tests exercise the real strand formation protocol: `StrandSolicitationService.registerResponder()` on the responder, `StrandSolicitationService.formStrand()` on the initiator, negotiation over `/sereus/bootstrap/1.0.0`, and resulting strand instances on both sides.

## Test Scenarios

### Phase 1: Strand formation protocol over libp2p

#### 1. Open strand formation (responderCreates mode)

Two parties (Alice = responder, Bob = initiator):
- Alice creates open invitation via `StrandSolicitationService.createOpenInvitation()`
- Alice registers responder on her authority node: `registerResponder(node)`
- Bob dials Alice's node and calls `formStrand(invitation, disclosure, node)`
- Responder provisions strand (via `StrandProvisioner` mock that returns a strandId)
- **Assert**: Both sides get a strandId; initiator's `FormStrandResult` has `memberKey` + `strandId`

#### 2. Formation with token validation

- Alice configures `FormationUsageRecorder` that tracks usage
- Bob uses token, formation succeeds, usage recorded
- Bob tries same token again → rejection (already used)
- **Assert**: second `formStrand` throws; `isTokenUsed(token)` returns true

#### 3. Formation with disclosure validation

- Alice configures `DisclosureValidator` that checks for required fields
- Bob sends valid disclosure → approved
- Carol sends invalid disclosure → rejected
- **Assert**: Bob's formation succeeds; Carol's throws

### Phase 2: End-to-end strand instance lifecycle

#### 4. Full cross-party formation + strand instance start

Two parties with CadreNode instances:
- Alice's CadreNode starts, creates open invitation
- Bob's CadreNode calls `formStrand()` using invitation
- After formation, both sides call `addStrand()` with the negotiated strandId + schema
- Strand instances start on both sides (separate libp2p networks)
- Manually connect strand-level libp2p nodes (strand peer discovery is TODO)
- Insert data on Alice's strand → verify it replicates to Bob's strand
- **Assert**: strand instances `status === 'active'` on both; data replicates

#### 5. Multiple strands between same parties

- Alice and Bob form two different strands (different sApps)
- Both strands operate independently
- Data inserted in strand-A doesn't appear in strand-B
- **Assert**: each strand has independent data; different strandIds

#### 6. Three-party strand (Party A invites B and C independently)

- Alice creates invitation, Bob and Carol both join
- All three have strand instances running
- **Assert**: three parties in strand; data from any party replicates to others

### Phase 3: Harness upgrade (optional, if time permits)

Wire `TestCadreNetwork.joinStrand()` to use the real formation protocol instead of the current stub. This makes the happy-path test exercise the real protocol automatically.

## Implementation Notes

- **StrandFormationManager** wraps strand-proto's `SessionManager` — it translates between cadre-core interfaces and the 3-message protocol
- For Phase 1, use raw libp2p nodes from `TestParty` and create `StrandSolicitationService` instances directly
- For Phase 2, use `CadreNode` instances (similar to `websocket-chat.integration.ts` pattern)
- The `StrandProvisioner` mock should generate deterministic strandIds for test predictability
- The `DisclosureValidator` and `FormationUsageRecorder` can be simple in-memory implementations
- Strand-level libp2p nodes don't auto-discover peers yet — manually dial between strand instances (same pattern as websocket-chat test)

## Assertion Points

| What | How |
|------|-----|
| Protocol handshake | `formStrand()` returns `FormStrandResult` with valid `strandId` |
| Strand provisioned | Responder's `StrandProvisioner.provisionStrand()` called |
| Token validation | `FormationUsageRecorder.isTokenUsed()` returns `true` after use |
| Token rejection | Second `formStrand()` with same token throws |
| Disclosure validation | Invalid disclosure causes `formStrand()` to throw |
| Strand instance active | `strandInstance.status === 'active'` on both parties |
| Data replication | Insert on party A → query on party B returns same data |
| Strand isolation | Data in strand-A absent from strand-B |

## TODO

### Phase 1 — protocol tests
- [ ] Create `strand-formation-e2e.integration.ts`
- [ ] Implement mock `StrandProvisioner`, `FormationUsageRecorder`, `DisclosureValidator`
- [ ] Implement test: open strand formation (responderCreates)
- [ ] Implement test: token validation + rejection
- [ ] Implement test: disclosure validation

### Phase 2 — full lifecycle tests
- [ ] Implement test: cross-party formation + strand instance + replication
- [ ] Implement test: multiple strands between same parties
- [ ] Implement test: three-party strand
- [ ] Verify all tests pass (`yarn test` in integration-tests)
