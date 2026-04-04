priority: 3
description: Multi-party strand formation workflows — closed strands, open strands, cross-party messaging, and convergence
files:
  - packages/integration-tests/src/scenarios/multi-party-workflows.integration.ts
----

## Summary

Implemented 5 integration tests validating the full cross-party strand lifecycle in `multi-party-workflows.integration.ts`.

### Scenarios implemented

**Phase 1 — Formation workflows:**

1. **Closed strand formation + bidirectional messaging** — Party A (responder) creates invitation with `StrandSolicitationService`, Party B (initiator) calls `formStrand()`. Both create strand instances with `Type: 'c'` and `MemberPrivateKey`. Verifies bidirectional chat message replication via the CHAT_SCHEMA (Member + Message tables).

2. **Party C exclusion (token reuse rejection)** — After Party B forms a strand using an invitation token, the token is marked as used via `recordFormationComplete()`. Party C attempting the same token is rejected with an error. Validates single-use token enforcement.

3. **Open strand join + bidirectional messaging** — Both parties directly call `addStrand()` with matching `strandId` and `Type: 'o'` (no formation protocol). Verifies bidirectional data replication with the SIMPLE_SCHEMA.

**Phase 2 — Convergence and resilience:**

4. **Cross-party interleaved writes** — Party A writes 5 rows, waits for replication to B, then B writes 5 rows. Both converge to 10 identical rows. Tests bulk cross-party write convergence.

5. **Multi-round bidirectional exchange** — 4 rounds of alternating writes (2 rows each round), with convergence verified between each round. Tests sustained bidirectional operation across multiple exchanges.

### Key implementation patterns

- Each test creates independent `CadreNode` instances with separate `partyId`s and `MemoryRawStorage`
- `setupStrandBetweenParties()` helper handles strand creation + manual strand-level libp2p dial + bidirectional connection wait
- Both sides of the connection must be verified (`strandA.libp2pNode.getConnections().length > 0`) before writing — the inbound connection on A takes a moment to register after B dials
- `queryAll()` helper collects rows from `db.eval()` async iterator (the Database type doesn't expose `.all()`)
- Phases 2 scenarios use independent control networks (no bootstrap between parties) to avoid control-level peers interfering with strand-level replication

### Known limitations documented during implementation

- **Offline writes + connect**: Data written before peers connect does not sync when peers later connect. The Optimystic replication engine only syncs blocks created while peers are connected. Disconnect/reconnect with offline writes is not yet supported. This could be a future ticket.
- **Concurrent writes from both parties**: Truly simultaneous writes (Promise.all from both sides) fail with "Some peers did not complete" because the replication engine requires peer acknowledgment within a timeout. Interleaved writes (one party at a time) work correctly.

### Testing

- All 5 new tests pass: `yarn workspace @serfab/integration-tests test`
- Full suite: 45/45 tests pass across 10 test files
- TypeScript: clean type check

## Test plan

- [ ] Verify all 5 scenarios pass: `npx vitest run src/scenarios/multi-party-workflows.integration.ts`
- [ ] Verify full integration suite still passes: `npx vitest run`
- [ ] Review test isolation (each test creates/destroys its own CadreNode instances)
- [ ] Confirm no port leaks or resource cleanup issues after full suite run
- [ ] Check that the `setupStrandBetweenParties` helper waits for connections on BOTH sides before returning
