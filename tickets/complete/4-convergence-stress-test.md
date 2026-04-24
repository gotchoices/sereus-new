priority: 2
description: Convergence stress test for concurrent message inserts across nodes
files: packages/integration-tests/src/scenarios/convergence-stress.integration.ts
----

## What Was Built

Three integration test scenarios in `convergence-stress.integration.ts` exercising rapid bidirectional inserts and verifying eventual convergence between two CadreNode instances (drone + phone):

1. **Sequential Burst Convergence** — 10+10 messages from each node, verifies all 20 converge with identical content sets
2. **Interleaved Inserts** — 20 alternating messages with random delays, verifies convergence
3. **Disconnection Resilience** — Bidirectional inserts, convergence, disconnect, verify persistence, reconnect, verify integrity

### Key Files

- `packages/integration-tests/src/scenarios/convergence-stress.integration.ts` — test file (3 scenarios)

### Testing

- All 3 convergence stress tests pass
- All 49 tests in the integration-tests package pass (0 failures)
- Type check clean
- Run: `yarn workspace @serfab/integration-tests test`

### Review Notes

- Resource cleanup is correct (afterAll stops nodes per describe block)
- Well-factored helpers: `setupDroneAndPhone`, `insertBatch`, `waitForConvergence`, `assertIdenticalMessages`
- Documents the synchronous replication constraint (writes block until peer ack)
- DRY note: CHAT_SCHEMA, wsTransports(), sAppConfig, nowTimestamp() are duplicated across websocket-chat, multi-party-workflows, and convergence-stress test files — pre-existing pattern, worth a consolidation ticket
