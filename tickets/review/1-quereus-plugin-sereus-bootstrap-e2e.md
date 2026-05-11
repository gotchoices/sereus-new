description: Review the bootstrap-mode wiring added to `connectToStrand` and the e2e suite that drives a real libp2p node + real FileRawStorage through the plugin.
files:
  - packages/quereus-plugin-sereus/src/types.ts
  - packages/quereus-plugin-sereus/src/connect.ts
  - packages/quereus-plugin-sereus/test/e2e/bootstrap.e2e.spec.ts
  - packages/quereus-plugin-sereus/vitest.config.ts
  - packages/quereus-plugin-sereus/package.json
  - packages/quereus-plugin-sereus/README.md
----

## What landed

### API surface (Phase A)

`StrandConnectionOptions` gained two public knobs:

- `mode?: 'bootstrap' | 'networked'` — `'networked'` (default) → network transactor; `'bootstrap'` → local transactor, no peer round trips required.
- `storage?: IRawStorage` — borrowed persistent raw storage. When set, it is handed to `createLibp2pNode` as `storage`. In `mode: 'bootstrap'` it is *also* wired into the optimystic plugin via `rawStorageFactory: () => storage`, so DML through the local transactor lands on the same backing store the libp2p node uses (no cache divergence between consumers, matches `cadre-core/strand-database.ts:106-122`).

The legacy `@internal transactor` override still works for the unit suite's `transactor: 'test'`, but its precedence rules tightened: `mode` wins when present; the legacy override only applies when `mode` is unspecified. The "skip libp2p node creation" gate was reworded from "create only for network" to "skip only for the unit-test fake transactor" (`resolvedTransactor !== 'test' || options.libp2pNode`) so that bootstrap mode (which resolves to `'local'`) gets a real node.

Shutdown remains: `collectionFactory.shutdown()` → `createdNode?.stop()`. `options.storage` is **never** closed — same borrower contract as cadre-core.

### e2e suite (Phase B)

`test/e2e/bootstrap.e2e.spec.ts` runs real libp2p + real `FileRawStorage` (no `vi.mock` anywhere — the sibling unit spec's mock is file-scoped). Four cases:

1. **CRUD round-trip in one connection** — insert/select/update/delete against an `App.Msg` table created via declarative schema. Sanity: count goes 3 → 2 after delete, update is reflected on the next select.
2. **Persistence across reopen** (headline) — `Database` #1 inserts `(42, 'persisted')`, shuts down. `Database` #2, fresh `FileRawStorage` over the *same* dir + same `strandId`, sees the row. This is the cold-start assertion `tickets/complete/1-wire-strand-storage-into-bootstrap-transactor.md` deferred to the host app.
3. **Schema-less bootstrap rejects `App.*`** — selecting from `App.Msg` without `schema` must throw (catches accidental auto-creation regressions in the default-vtab path).
4. **Three open/close cycles over one storage path** — catches handle leaks (file locks, libp2p sockets) that only surface on the second cycle.

Per-test isolation: tmp dir under `os.tmpdir()/sereus-plugin-e2e/<uuid>`, random `strandId` per test, `afterEach` runs `shutdown()` → `db.close()` → `fs.rm(dir)` even on failure.

### Vitest layout (Phase C)

`vitest.config.ts` switched to `test.projects` with two projects:

- `unit` — `test/**/*.spec.ts` excluding `test/e2e/**`, default 5s timeout.
- `e2e` — `test/e2e/**/*.spec.ts`, 60s test timeout (libp2p startup is slow on cold Windows runs).

`yarn test` runs both; `yarn test:e2e` runs only the e2e project (`vitest run --project e2e`). v4 schema accepted the projects-in-config form on first try — no separate `vitest.e2e.config.ts` needed.

### Docs (Phase D)

`README.md` got a "Bootstrap mode" Quick Start example, two new rows (`mode`, `storage`) in the options table, and `yarn test:e2e` in the dev section. `docs/architecture.md` §"Strand Mode: Bootstrap vs Networked" already describes the conceptual model at the `StrandDatabase` level; nothing stale.

## Validation

- `yarn workspace @serfab/quereus-plugin-sereus build` → exit 0.
- `yarn workspace @serfab/quereus-plugin-sereus test` → 25/25 green (21 unit + 4 e2e).
- DEBUG log spot check confirms the new path: `mode=bootstrap, transactor=local`, `Created libp2p node (... storage=true)`, `Set default vtab to optimystic (... transactor=local)`.

## Review focus

- **Resolution rules** in `src/connect.ts:43-54`. The precedence order is documented but worth a second read: `mode` wins; legacy `transactor` only honored when `mode` is absent.
- **The node-creation gate change** (`resolvedTransactor !== 'test' || options.libp2pNode`) — the unit suite covers both `transactor: 'test'` (skip) and the default network path (create). Verify there's no third path the gate now broadens unintentionally.
- **`rawStorageFactory` cast** in `src/connect.ts:78-86`. Same `unknown` cast `strand-database.ts:118-121` uses — annotated. If a cleaner option exists in the optimystic plugin's published signature, that's a small follow-up but not a blocker.
- **e2e shutdown safety**. The `afterEach` swallows shutdown/close errors with `console.error` to ensure tmp dir cleanup runs. If a test ever fails for a non-obvious reason, that log line is the breadcrumb.
- **Cadre-core duplication**. `connectToStrand` and `StrandDatabase.initialize` now mirror the same bootstrap wiring. The ticket explicitly parked consolidation as a future-only concern — confirm reviewers agree.

## Tests to run

- `yarn workspace @serfab/quereus-plugin-sereus test` (full suite)
- `yarn workspace @serfab/quereus-plugin-sereus test:e2e` (e2e project only)
- For manual verification: `$env:DEBUG="sereus:plugin:strand"; yarn workspace @serfab/quereus-plugin-sereus test:e2e -- -t "CRUD"` — should print `mode=bootstrap, transactor=local`.
