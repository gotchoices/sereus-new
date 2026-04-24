priority: 3
description: Multi-party strand formation workflows — closed strands, open strands, cross-party messaging, and convergence
files:
  - packages/integration-tests/src/scenarios/multi-party-workflows.integration.ts
  - packages/integration-tests/src/harness/wait-utils.ts
  - packages/cadre-core/src/cadre-node.ts
  - packages/cadre-core/src/strand-solicitation.ts
----

## What was built

5 integration tests in `multi-party-workflows.integration.ts` validating cross-party strand lifecycle:

1. **Closed strand formation + bidirectional messaging** — Invitation-based strand formation via `StrandSolicitationService`, with CHAT_SCHEMA replication both directions.
2. **Token reuse rejection** — Single-use token enforcement after `recordFormationComplete()`.
3. **Open strand join + bidirectional messaging** — Both parties directly `addStrand()` with matching strandId, SIMPLE_SCHEMA replication verified.
4. **Cross-party interleaved writes** — 5 rows from each party, convergence to 10 identical rows.
5. **Multi-round bidirectional exchange** — 4 rounds of alternating writes (2 each), convergence verified between rounds.

## Key files

- `packages/integration-tests/src/scenarios/multi-party-workflows.integration.ts` — all 5 tests
- `packages/integration-tests/src/harness/wait-utils.ts` — `waitUntil` polling helper

## Review notes

- Removed unused `afterAll` import
- Fixed header comment: scenario descriptions now match actual tests (was "Disconnect/reconnect sync", now "Multi-round bidirectional exchange")
- Resource cleanup verified: every test uses `try/finally` with `stop()` in correct order
- Test isolation: each test creates independent CadreNode instances with unique timestamps
- `setupStrandBetweenParties` correctly waits for connections on BOTH sides before returning
- No `any` types, lowercase SQL, proper typing throughout
- 45/45 tests pass, TypeScript clean

## Known limitations (documented, not in scope)

- Offline writes before connect don't sync — Optimystic only syncs blocks created while peers are connected
- Truly concurrent writes (Promise.all from both sides) fail — replication engine requires peer acknowledgment within timeout; interleaved writes work correctly
