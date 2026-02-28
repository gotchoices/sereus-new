priority: 4
description: E2E strand formation tests exercising strand-proto bootstrap over real libp2p
files:
  - packages/integration-tests/src/scenarios/strand-formation-e2e.integration.ts
----

## What was built

Six E2E integration tests for the strand formation protocol over real libp2p, covering two phases:

### Phase 1: Protocol over libp2p (using TestCadreNetwork + StrandSolicitationService directly)

1. **Open strand formation (responderCreates)** — Alice registers as responder, creates invitation; Bob dials and forms strand via `/sereus/bootstrap/1.0.0`. Asserts valid `memberKey`, `invitePrivateKey`, and `strandId` on result.

2. **Token validation + rejection** — Uses `FormationUsageRecorder` to track token usage. First formation succeeds and records usage; second attempt with same token is rejected.

3. **Disclosure validation** — Tests accept-all and reject-all `DisclosureValidator` configurations. Verifies that the `validateIdentity` hook correctly gates formation.

### Phase 2: Strand instance lifecycle (using CadreNode)

4. **Cross-party formation + strand instance + replication** — Two CadreNodes form strand, add strand instances with signed sApp schema, connect strand-level libp2p, insert data on Alice, verify replication to Bob.

5. **Multiple strands between same parties** — Two independent strands (different sApps), data isolation verified: strand-A data absent from strand-B and vice versa.

6. **Three-party strand** — Alice (responder), Bob and Carol (initiators) all join same strand. Data from Alice replicates to both Bob and Carol.

## Key implementation decisions

- **Signed sApp schemas**: Phase 2 tests generate Ed25519 keypairs and sign schemas using `signSchema()` to satisfy `assertSchemaSignature()`. The `id` field is the author public key.
- **Disclosure validation scope**: The protocol currently sends `{ partyId: sessionId }` as the identity bundle (not full disclosure). Tests validate accept/reject behavior using simple validators rather than field-level disclosure checking.
- **Strand-level connectivity**: Manually dialed between strand libp2p nodes (same pattern as websocket-chat test). Strand peer discovery via control network is TODO.

## Testing notes

- All 6 new tests pass (`yarn workspace @serfab/integration-tests run vitest run src/scenarios/strand-formation-e2e.integration.ts`)
- Full integration suite: 35/36 pass. The 1 failure is pre-existing in `websocket-chat.integration.ts` (missing schema signature — unrelated to this work).
- Test durations: Phase 1 tests ~130-370ms each; Phase 2 tests ~450-730ms each.

## Usage

```bash
# Run just the strand formation tests
yarn workspace @serfab/integration-tests run vitest run src/scenarios/strand-formation-e2e.integration.ts

# Run all integration tests
yarn workspace @serfab/integration-tests run vitest run
```
