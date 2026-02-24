priority: 3
description: Multi-party strand formation workflows — closed strands, open strands, cross-party messaging, and convergence
dependencies: packages/integration-tests, packages/cadre-core (CadreNode, StrandSolicitationService, StrandFormationManager), packages/strand-proto
files:
  - packages/integration-tests/src/scenarios/multi-party-workflows.integration.ts
  - packages/integration-tests/src/harness/test-network.ts (optional: wire joinStrand to real protocol)
  - packages/cadre-core/src/cadre-node.ts
  - packages/cadre-core/src/strand-solicitation.ts
  - packages/cadre-core/src/strand-formation-manager.ts
  - packages/strand-proto/src/bootstrap.ts
----

## Context

This task validates the full cross-party strand lifecycle: two independent parties (each a CadreNode with its own `partyId`) forming strands, exchanging messages, and converging under concurrent writes and network disruptions.

The existing `websocket-chat.integration.ts` proves same-party replication (drone ↔ phone, one `partyId`, manual `addStrand()`). The existing `4-e2e-strand-formation-tests.md` covers the formation protocol mechanics. This task exercises the **end-to-end multi-party workflow** — formation through convergence — as a higher-level integration scenario.

### Key architectural points

- Each CadreNode uses a different `partyId`, which creates separate control networks (scoped by `control-${partyId}`).
- Cross-party strand formation uses `StrandSolicitationService`: responder registers on its control libp2p node, initiator dials the responder's bootstrap addresses.
- After formation, both parties call `addStrand()` with the negotiated `strandId` + sApp config. Each strand instance creates its own libp2p node with `networkName = strand-${strandId}`.
- Strand-level peer discovery across parties is not yet wired up — manually dial between strand instances (same pattern as `websocket-chat.integration.ts`).

### Existing patterns to follow

- **CadreNode setup**: See `websocket-chat.integration.ts` — `CadreNodeConfig` with WS transports, `MemoryRawStorage`, ephemeral ports.
- **Formation API**: `cadreNode.initializeStrandSolicitation({ strandProvisioner, formationUsageRecorder })`, `cadreNode.createOpenInvitation(sAppId)`, `cadreNode.formStrand(invitation, disclosure)`.
- **Strand instance access**: `strand.database!.getDatabase()` for SQL queries, `strand.libp2pNode!` for networking.
- **Wait utilities**: `waitUntil()` from `../harness/wait-utils.js`.

## Test Design

### File: `packages/integration-tests/src/scenarios/multi-party-workflows.integration.ts`

### Shared setup

Two CadreNode instances per `describe` block:
- **Party A** (`storage` profile, WS listener) — responder
- **Party B** (`storage` profile, WS listener) — initiator
- Each has its own `partyId` (UUID)
- WS transports: `webSockets()` + `circuitRelayTransport()`
- `MemoryRawStorage` for all strand storage
- `hibernation: { enabled: false }`

Mock implementations needed for responder (Party A):
- `StrandProvisioner` — generates `strandId` from `sAppId` + timestamp
- `FormationUsageRecorder` — in-memory Map tracking token validity and usage

Chat schema (reuse from `websocket-chat.integration.ts`):
```sql
table Member (Id text primary key, Name text not null);
table Message (Id integer primary key, MemberId text not null, Content text not null,
               Timestamp datetime not null, foreign key (MemberId) references Member(Id));
```

Helper: `setupStrandBetweenParties(partyA, partyB, strandId, sAppConfig)`:
1. Both call `addStrand()` with matching `strandId` + `sAppConfig`
2. Manual dial from B's strand node to A's strand node
3. `waitUntil()` B's strand node has connections

### Scenario 1: Closed strand formation and messaging

1. Party A starts CadreNode, initializes solicitation service with provisioner + usage recorder
2. Party A creates open invitation: `partyA.createOpenInvitation(sAppId, 60_000)`
3. Party B starts CadreNode, calls `partyB.formStrand(invitation, { partyId: bPartyId })`
4. **Assert**: `FormStrandResult` has `strandId`, `memberKey`, `invitePrivateKey`
5. Both parties call `addStrand()` with `strandRow: { Id: strandId, MemberPrivateKey: result.invitePrivateKey, Type: 'c' }`
6. Manually connect strand-level libp2p nodes
7. Party A inserts a member + message on its strand DB
8. **Assert**: Message replicates to Party B within timeout
9. Party B inserts a reply message
10. **Assert**: Reply replicates to Party A

### Scenario 2: Uninvited Party C cannot write to closed strand

1. Party C starts a CadreNode, manually creates a strand instance with the same `strandId` but no valid `MemberPrivateKey`
2. Party C dials Party A's strand node (network level access is possible since libp2p doesn't gate by member key)
3. Party C attempts to insert a message using the sApp schema
4. **Assert**: If the sApp has authorization constraints requiring `MemberKey` context, Party C's writes fail schema validation. If the simple chat schema doesn't enforce member keys, document this as a limitation and verify network-level isolation instead (Party C's data shouldn't appear on A or B).

*Note: The simple chat schema from websocket-chat doesn't enforce member keys. For a full closed-strand exclusion test, use `SIMPLE_SAPP_LOGIC` from fixtures (which has `AuthorizedWrite` constraints requiring `context.MemberKey`). Alternatively, test at the strand formation level: Party C calls `formStrand()` with the same invitation token → rejection because token is already used.*

### Scenario 3: Open strand join

1. Party A creates an open strand (no invitation needed)
2. Party A calls `addStrand()` with `Type: 'o'`, `MemberPrivateKey: null`
3. Party B receives the `strandId` out-of-band (simulated)
4. Party B calls `addStrand()` with the same `strandId`, `Type: 'o'`
5. Manually connect strand-level nodes
6. Both parties insert messages
7. **Assert**: Messages replicate bidirectionally

### Scenario 4: Cross-party concurrent writes

1. Set up a strand between Party A and Party B (from scenario 1 or 3)
2. Both parties insert 5 messages concurrently (`Promise.all`)
3. **Assert**: Both nodes converge to 10 messages (plus member rows)
4. **Assert**: Message sets are identical on both nodes

### Scenario 5: Disconnect/reconnect sync

1. Set up a strand between Party A and Party B with initial messages
2. Disconnect Party B's strand node from Party A (close connections or stop libp2p node)
3. Party A inserts 3 messages while B is disconnected
4. Party B inserts 2 messages while disconnected
5. Reconnect (re-dial)
6. **Assert**: Both converge to total message count (initial + 3 + 2)
7. **Assert**: All messages present on both nodes

## Implementation Notes

- Use the CadreNode high-level API (`createOpenInvitation`, `formStrand`, `addStrand`) rather than lower-level harness methods.
- The `StrandFormationManager` bridges cadre-core → strand-proto. If the real protocol fails (e.g., due to unfinished wiring), fall back to the manual `addStrand()` pattern from websocket-chat and note it as a TODO for protocol-level testing.
- For disconnect simulation: `strand.libp2pNode!.getConnections().forEach(c => c.close())` then re-dial.
- The `SIMPLE_SAPP_LOGIC` fixture (with `AuthorizedWrite` constraint) requires `context.MemberKey` and `context.Signature` — use this for closed strand authorization tests.
- The simple chat schema (no auth constraints) suffices for open strand and convergence tests.

## Dependencies

- Depends conceptually on `4-e2e-strand-formation-tests.md` for protocol correctness, but can proceed independently using fallback patterns if the protocol isn't fully wired yet.
- The `2-convergence-stress-test.md` covers same-party convergence. Scenarios 4-5 here extend that to cross-party.

## TODO

### Phase 1 — formation workflows
- [ ] Create `packages/integration-tests/src/scenarios/multi-party-workflows.integration.ts`
- [ ] Implement shared helpers: `createPartyNode()`, `setupStrandBetweenParties()`, mock provisioner/recorder
- [ ] Implement scenario 1: closed strand formation + bidirectional messaging
- [ ] Implement scenario 2: Party C exclusion (token reuse rejection or schema-level authorization)
- [ ] Implement scenario 3: open strand join + bidirectional messaging

### Phase 2 — convergence and resilience
- [ ] Implement scenario 4: cross-party concurrent writes
- [ ] Implement scenario 5: disconnect/reconnect sync
- [ ] Verify all tests pass with `yarn workspace @serfab/integration-tests test`
