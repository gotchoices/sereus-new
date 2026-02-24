priority: 2
description: Convergence stress test for concurrent message inserts across nodes
dependencies: packages/integration-tests, packages/cadre-core, websocket-chat.integration.ts
files: packages/integration-tests/src/scenarios/convergence-stress.integration.ts
----

## Context

The existing `websocket-chat.integration.ts` validates single-message replication. This test extends that pattern to exercise rapid concurrent inserts from both nodes and verify eventual convergence — the scenario where two cadre nodes (phone + drone) both write messages simultaneously and must reach the same final state.

This is a Vitest integration test (not Maestro) because it requires precise timing control, programmatic access to both databases, and quantitative assertions that are impractical through a UI test framework. It complements the Maestro E2E flows which cover the UI path.

## Test Design

### Test: Concurrent Message Inserts Converge

```
Setup: drone + phone CadreNodes (same pattern as websocket-chat.integration.ts)
       Both connected, strand created, strand nodes dialed

1. Insert 10 messages on the drone (rapid fire, no await between inserts)
2. Simultaneously insert 10 messages on the phone
3. Wait for convergence: both nodes have 20 messages
4. Assert: message sets are identical (same IDs, content, order)
5. Assert: no duplicate IDs, no lost messages
```

### Test: Interleaved Inserts

```
1. For i in 1..20:
   - If i is odd: insert on drone
   - If i is even: insert on phone
   - Small random delay (0-50ms) between inserts
2. Wait for convergence
3. Assert: 20 messages on each node, identical sets
```

### Test: Burst After Reconnection

```
1. Drone inserts 5 messages
2. Disconnect phone from drone strand (simulating network loss)
3. Drone inserts 5 more messages while phone is disconnected
4. Phone inserts 3 messages while disconnected
5. Reconnect phone to drone strand
6. Wait for convergence: both nodes have 13 messages
7. Assert: all messages present on both nodes
```

## Implementation

Extend the patterns from `websocket-chat.integration.ts`:

```typescript
// Helper: insert N messages rapidly on a strand
async function insertBatch(
  strand: StrandInstance,
  memberId: string,
  count: number,
  prefix: string,
): Promise<void> {
  const db = strand.database!.getDatabase();
  for (let i = 0; i < count; i++) {
    const id = /* auto-increment subquery */;
    await db.exec(
      `insert into App.Message (Id, MemberId, Content, Timestamp)
       values ((select coalesce(max(Id), 0) + 1 from App.Message), ?, ?, ?)`,
      [memberId, `${prefix}-${i}`, now()],
    );
  }
}

// Helper: wait for message count convergence
async function waitForConvergence(
  strands: StrandInstance[],
  expectedCount: number,
  timeoutMs = 30_000,
): Promise<void> {
  await waitUntil(async () => {
    for (const strand of strands) {
      const db = strand.database!.getDatabase();
      const row = await db.get('select count(*) as cnt from App.Message');
      if ((row?.cnt as number) < expectedCount) return false;
    }
    return true;
  }, { timeoutMs, intervalMs: 250, description: `convergence at ${expectedCount} messages` });
}
```

### Convergence Metrics

After convergence, collect and log:
- Time to convergence (ms from last insert to all nodes matching)
- Message ordering consistency (are IDs in the same order?)
- Any Optimystic conflict resolution events

## TODO
- [ ] Create `packages/integration-tests/src/scenarios/convergence-stress.integration.ts`
- [ ] Implement `insertBatch` and `waitForConvergence` helpers
- [ ] Write test: concurrent inserts (10+10 → 20)
- [ ] Write test: interleaved inserts with random delays
- [ ] Write test: burst after reconnection (disconnect/reconnect scenario)
- [ ] Add convergence timing metrics to test output
- [ ] Verify all tests pass with `yarn workspace @serfab/integration-tests test`
