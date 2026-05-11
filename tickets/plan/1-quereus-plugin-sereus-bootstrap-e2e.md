description: End-to-end test coverage for `quereus-plugin-sereus` running against a real bootstrap-mode strand (real libp2p node, real coordinated repo, real strand storage), exercising the full SQL path through `connectToStrand`.
files:
  - packages/quereus-plugin-sereus/src/connect.ts
  - packages/quereus-plugin-sereus/src/plugin.ts
  - packages/quereus-plugin-sereus/test/plugin.spec.ts
  - packages/quereus-plugin-sereus/vitest.config.ts
  - packages/cadre-core/src/strand-database.ts
  - packages/cadre-core/src/strand-instance-manager.ts
----

## Problem

The current test suite in `packages/quereus-plugin-sereus/test/plugin.spec.ts` is unit-only. It mocks `createLibp2pNode` from `@optimystic/db-p2p` and uses `transactor: 'test'` so the optimystic plugin never touches a real libp2p node, real coordinated repo, or real strand storage. As a result:

- The `connectToStrand` happy-path (crypto plugin → optimystic plugin → libp2p creation → `collectionFactory.registerLibp2pNode` → default vtab → schema apply) is verified only at the seam level.
- Once the recently-landed `wire-strand-storage-into-bootstrap-transactor` change is in, no test in this package proves that DML through `App.*` tables actually round-trips through the optimystic vtab into a real `IRawStorage` and survives a database close/reopen against the same storage.
- Regressions in any of the linked packages (`@quereus/quereus`, `@optimystic/quereus-plugin-optimystic`, `@optimystic/db-p2p`, `@optimystic/db-core`) that change the contract this plugin depends on would not be caught here — they would surface in the host app (sereus-health) instead, where reproduction is much more expensive.

## Scope

A single in-process e2e suite for `quereus-plugin-sereus` using **bootstrap mode** (solo-node, no peers). Bootstrap mode is the cheapest configuration that exercises the full real stack and the cold-restart persistence path.

In scope:

- A vitest suite (e.g. `test/e2e/bootstrap.e2e.spec.ts`) that does **not** mock `@optimystic/db-p2p` and does **not** use `transactor: 'test'`. It creates a real libp2p node via `createLibp2pNode` with no bootstrap peers and a deterministic ephemeral `IRawStorage` (filesystem under `os.tmpdir()` per test, cleaned in `afterEach`).
- Coverage for these scenarios, each against a real `App.*` table declared via `connectToStrand({ schema })`:
  - **CRUD round-trip:** `insert into App.X ...` / `update` / `delete` / `select` all return correct results within a single connection.
  - **Persistence across reopen:** open db1 → insert → `shutdown()` → open db2 against the *same* storage path → `select` returns the previously inserted rows. This is the assertion the existing `cadre-core` smoke deliberately skipped, and it is the reason the bootstrap-transactor fix shipped.
  - **Schema-less mode:** `connectToStrand` without a `schema` should not create the `App` schema, and queries against `App.*` should fail (already covered as a unit, re-assert under real wiring as a sanity check).
  - **Shutdown ordering:** after `result.shutdown()`, the libp2p node is stopped and the storage handle is released cleanly (no dangling file locks; second open in the same process succeeds).
- A vitest test-tag (e.g. `e2e`) so CI can run/skip the suite independently of the existing fast unit tests.

Out of scope (separate tickets):

- Multi-peer / networked-mode e2e (see `quereus-plugin-sereus-networked-e2e`).
- Maestro-style host-app e2e on device (already tracked under `6-maestro-e2e-flows`).
- Performance/scale (tracked under `4-scale-testing`).

## Expected behavior

A green run of `yarn workspace @sereus/quereus-plugin-sereus test` (or the equivalent `yarn test --project e2e`) demonstrates end-to-end that:

1. The published `connectToStrand` API, called with a real bootstrap-mode config and a persistent `IRawStorage`, produces a working SQL surface backed by the optimystic vtab.
2. Rows written through that surface are durable across `shutdown()` + reopen against the same storage path — the host-app cold-start manual check in `1-wire-strand-storage-into-bootstrap-transactor.md` becomes redundant for regression purposes.
3. The plugin cleans up libp2p and storage resources on shutdown such that the suite can run repeatedly in the same process without leaking handles.

## References

- `packages/quereus-plugin-sereus/src/connect.ts` — composition under test.
- `packages/cadre-core/src/strand-database.ts` and `strand-instance-manager.ts` — show how host code wires the same plugin in bootstrap mode; the e2e should mirror that wiring (minus the cadre-core layer) so it stays representative.
- `tickets/complete/1-wire-strand-storage-into-bootstrap-transactor.md` — motivation; explicitly defers cold-start persistence validation to the host app today.
- `docs/architecture.md` (Strand Lifecycle → Bootstrap vs Networked) — modes the test must respect.
