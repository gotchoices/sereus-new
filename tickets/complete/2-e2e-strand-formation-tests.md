priority: 4
description: E2E strand formation tests exercising strand-proto bootstrap over real libp2p
completed: 2026-03-02
files:
  - packages/integration-tests/src/scenarios/strand-formation-e2e.integration.ts
----

## What was built

Six E2E integration tests for the strand formation protocol over real libp2p, covering two phases:

### Phase 1: Protocol over libp2p (TestCadreNetwork + StrandSolicitationService)

1. **Open strand formation** — Alice registers as responder, creates invitation; Bob dials and forms strand via `/sereus/bootstrap/1.0.0`. Asserts valid `memberKey`, `invitePrivateKey`, and `strandId`.
2. **Token validation + rejection** — `FormationUsageRecorder` tracks token usage. First formation succeeds; second attempt with same token is rejected.
3. **Disclosure validation** — Accept-all and reject-all `DisclosureValidator` configurations gate formation.

### Phase 2: Strand instance lifecycle (CadreNode)

4. **Cross-party formation + replication** — Two CadreNodes form strand, add instances with signed sApp schema, connect strand-level libp2p, insert data on Alice, verify replication to Bob.
5. **Multiple strands between same parties** — Two independent strands with different sApps; data isolation verified.
6. **Three-party strand** — Alice (responder), Bob and Carol (initiators) all join same strand. Data replicates to both.

## Review cleanup

- Removed dead code: unused `createAllowlistValidator` helper
- Removed unused imports: `sleep`, `TestParty`, `StrandFormationDisclosure`, `OpenInvitation`, `StrandSolicitationServiceOptions`, `StrandInstance`
- Extracted `createTestNodeConfig()` helper to eliminate duplicated CadreNode config boilerplate across Phase 2 tests
- Removed redundant `carolStrandRow` variable (reuses existing `strandRow`)

## Testing

- All 6 strand formation tests pass (2.2s total)
- Full integration suite: 35/36 pass. The 1 failure is pre-existing in `websocket-chat.integration.ts` (missing schema signature — unrelated)

## Usage

```bash
yarn workspace @serfab/integration-tests run vitest run src/scenarios/strand-formation-e2e.integration.ts
```
