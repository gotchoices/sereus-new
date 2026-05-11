description: Add bootstrap-mode wiring to `connectToStrand` (storage + mode), then an e2e suite that drives a real libp2p node + real FileRawStorage through the plugin and asserts CRUD + cold-restart persistence.
files:
  - packages/quereus-plugin-sereus/src/types.ts
  - packages/quereus-plugin-sereus/src/connect.ts
  - packages/quereus-plugin-sereus/test/e2e/bootstrap.e2e.spec.ts
  - packages/quereus-plugin-sereus/vitest.config.ts
  - packages/quereus-plugin-sereus/package.json
  - packages/quereus-plugin-sereus/README.md
----

## Why this needs an API change first

The current `connectToStrand` exposes two paths only:

- `transactor: 'network'` → calls `createLibp2pNode({ port, bootstrapNodes, networkName, fretProfile })` (no `storage`) and uses the network transactor.
- `transactor: 'test'` → no libp2p node, fake test transactor (existing unit suite).

Neither path lets a caller wire persistent storage into the optimystic plugin's local transactor — the surface that the `wire-strand-storage-into-bootstrap-transactor` fix introduced. The host (`cadre-core/strand-database.ts`) bypasses `connectToStrand` and registers the optimystic plugin directly precisely because of this gap. To validate the bootstrap-mode persistence path *through* `connectToStrand`, the plugin must first expose it.

The cadre-core wiring this mirrors is:

- `createLibp2pNode({ storage: strandStorage, ... })` — same instance used for the libp2p data path.
- `optimysticPlugin(db, { default_transactor: 'local', rawStorageFactory: () => strandStorage, ... })` — same instance used by the local transactor (so DML lands on the host backend, not `MemoryRawStorage`).
- `db.setDefaultVtabArgs({ transactor: 'local', ... })` — declarative-schema tables route through the local transactor.

## Scope

### Phase A — extend `connectToStrand` to support bootstrap mode

**`packages/quereus-plugin-sereus/src/types.ts`**

Add to `StrandConnectionOptions`:

```ts
import type { IRawStorage } from '@optimystic/db-p2p';

/**
 * Lifecycle mode. `'networked'` (default) uses the network transactor and
 * is appropriate for multi-peer participation. `'bootstrap'` switches to a
 * local transactor so a solo node can apply schema and accept DML with no
 * peer round trips; pair it with a persistent `storage` to survive restart.
 */
mode?: 'bootstrap' | 'networked';

/**
 * Persistent raw storage. When provided:
 *  - it is passed to `createLibp2pNode` as `storage` so the libp2p data path uses it,
 *  - in `bootstrap` mode it is also handed to the optimystic plugin as
 *    `rawStorageFactory: () => storage` so the local transactor persists DML
 *    on the same instance (avoids cache divergence between the two consumers).
 */
storage?: IRawStorage;
```

Keep the existing `@internal transactor?: string` escape hatch (the unit suite still uses `transactor: 'test'`). When `mode` is set explicitly it wins; otherwise resolve as: `mode === 'bootstrap'` → `'local'`, `mode === 'networked'` (or undefined) → `'network'`, with the legacy `transactor` override taking precedence only when `mode` is not specified. The single resolved value flows into `default_transactor`, `setDefaultVtabArgs.transactor`, and the "skip-node-creation" gate.

**`packages/quereus-plugin-sereus/src/connect.ts`**

- Compute `resolvedTransactor` from `mode` / `transactor` per the rules above.
- When building the optimystic plugin config, if `options.storage` is provided and `resolvedTransactor === 'local'`, include `rawStorageFactory: () => options.storage!`. Cast through `unknown` to the plugin's published `Record<string, SqlValue>` parameter type, exactly as `cadre-core/strand-database.ts` does (annotate the cast).
- When creating the libp2p node (the `resolvedTransactor === 'network' || options.libp2pNode` branch), if `options.storage` is provided, include `storage: options.storage` in the `createLibp2pNode({ ... })` call. The bootstrap-mode test enters this branch too (`resolvedTransactor === 'local'` but no `libp2pNode` injected) — extend the gate so it also covers `mode === 'bootstrap'`, OR more simply: drop the `'test'` skip into an explicit check and always create the libp2p node for any non-`'test'` resolved transactor. The condition that should *skip* node creation is "this is the unit-test fake transactor"; everything else needs a real node.
- Pass the resolved transactor to `db.setDefaultVtabArgs({ transactor: resolvedTransactor, ... })`.
- Plugin shutdown remains: `collectionFactory.shutdown()` then `createdNode.stop()`. Storage is **not** closed here — same rule as cadre-core: the plugin is a borrower, not an owner of `options.storage`.

Out of scope for this ticket: refactoring `cadre-core/StrandDatabase` to call `connectToStrand` instead of re-implementing the wiring. The duplication is intentional for now; consolidating it is a follow-up. (Park as a `backlog/` ticket only if you discover it'd be cheap.)

### Phase B — e2e suite

**`packages/quereus-plugin-sereus/test/e2e/bootstrap.e2e.spec.ts`**

Constraints:

- **No `vi.mock('@optimystic/db-p2p', ...)`** anywhere in this file. The existing unit suite's `vi.mock` is scoped to that spec file by Vitest, so a sibling file under `test/e2e/` will not inherit it — verify this with a smoke run before writing the rest.
- Real `FileRawStorage` from `@optimystic/db-p2p-storage-fs`. Add `@optimystic/db-p2p-storage-fs` to `devDependencies` (cadre-cli already depends on it at `^0.13.0`; match that version).
- Per-test storage dir under `os.tmpdir()` (e.g. `path.join(os.tmpdir(), 'sereus-plugin-e2e', randomUUID())`). `afterEach` removes it with `fs.promises.rm(dir, { recursive: true, force: true })`.
- Per-test random `strandId` (`randomUUID()`) so concurrent runs and the optimystic plugin's internal caches don't collide.
- libp2p `port: 0`, `bootstrapNodes: []` — purely solo.
- All cases call `result.shutdown()` in `afterEach` (idempotency: track per-test, skip if already shut down).

Test cases (each its own `it` against a fresh tmp dir):

1. **CRUD round-trip in a single connection.** Connect with `mode: 'bootstrap'`, `storage`, and a small schema (e.g. `table Msg (Id integer primary key, Body text not null)`). `insert into App.Msg(Id, Body) values (1,'a'),(2,'b'),(3,'c')`. `select count(*) from App.Msg` → 3. `update App.Msg set Body='B' where Id=2`. `select Body from App.Msg where Id=2` → `'B'`. `delete from App.Msg where Id=1`. `select count(*) from App.Msg` → 2. (Use `db.eval` with the existing `for await` pattern in the unit spec.)

2. **Persistence across reopen (the headline assertion).** Same storage dir reused. First `Database` + `connectToStrand({ mode:'bootstrap', storage, schema })` → insert 1 row → `result.shutdown()` → `db.close()`. Then build a *second* `Database`, a *second* `FileRawStorage(samePath)`, *second* `connectToStrand({ mode:'bootstrap', storage, schema })` against the same `strandId` → `select * from App.Msg` returns the row inserted by the first connection.
   - This is the assertion `cadre-core` explicitly deferred to the host app in `tickets/complete/1-wire-strand-storage-into-bootstrap-transactor.md` (search for "pending host-app exercise"). Once green here, that manual host-app check is redundant for regression.
   - Schema apply on second connect is expected to be a no-op (declarative-schema diff against existing tables). If it errors, that's a real bug — file a `fix/` ticket and don't paper over it.

3. **Schema-less mode under real wiring.** `connectToStrand({ mode:'bootstrap', storage })` (no `schema`). Selecting from `App.Msg` must reject — same assertion the unit suite has, but against real wiring as a sanity check that the default-vtab plumbing didn't silently auto-create something.

4. **Shutdown ordering / no leaked handles.** After `result.shutdown()`: a second `connectToStrand` against the same storage path in the same process succeeds (no `EBUSY` / lock leak from the libp2p node or storage). Repeat 2–3 times in one `it` to catch handle leaks that only manifest on the second cycle.

Skip from scope: networked / multi-peer (separate ticket `quereus-plugin-sereus-networked-e2e`, not yet filed — fine), maestro flows, scale.

### Phase C — vitest project for the `e2e` tag

`packages/quereus-plugin-sereus/vitest.config.ts` currently has one flat config. Switch to vitest 4.x `test.projects` with two projects:

- `unit` — `include: ['test/**/*.spec.ts', '!test/e2e/**']`, fast, no real libp2p.
- `e2e` — `include: ['test/e2e/**/*.spec.ts']`, `testTimeout: 60_000` (libp2p startup can be slow on cold-cache Windows runs).

Wire `yarn test` to run both projects (default). Add a `yarn test:e2e` script that targets only the e2e project (`vitest run --project e2e`). CI can use either.

If `test.projects` proves fussy on vitest 4.x (the syntax shifted a couple of times in 3.x→4.x), fall back to a separate `vitest.e2e.config.ts` plus a `test:e2e` script that points `--config` at it. Either is acceptable; don't let configuration shape consume the ticket — prefer projects if it works on first try.

### Phase D — docs

Update `packages/quereus-plugin-sereus/README.md`:

- Add `mode` and `storage` rows to the `StrandConnectionOptions` table.
- Add a small "Bootstrap mode" subsection under Quick Start with a 6–8 line example using `FileRawStorage` and `mode: 'bootstrap'`. Mirror the cadre-core ownership note: the plugin does not close `storage` on shutdown.

`docs/architecture.md` does not need changes — the existing "Strand Mode: Bootstrap vs Networked" subsection already covers the conceptual model; the plugin is now just another consumer of it.

## References

- `packages/quereus-plugin-sereus/src/connect.ts` (`connectToStrand`) — the composition under test.
- `packages/cadre-core/src/strand-database.ts:106-122` — the bootstrap-mode plugin config we're mirroring (especially the `rawStorageFactory` cast).
- `packages/cadre-core/src/strand-instance-manager.ts:182-216` — the shared-storage pattern (one `IRawStorage` to both `createLibp2pNode` and the database).
- `C:/projects/optimystic/packages/quereus-plugin-optimystic/test/local-transactor-storage.spec.ts` — upstream proof that the optimystic plugin honours `rawStorageFactory`; we're now closing the loop end-to-end above it.
- `tickets/complete/1-wire-strand-storage-into-bootstrap-transactor.md` — motivation and the cold-start verification we're inheriting from the host app.
- `docs/architecture.md` §"Strand Mode: Bootstrap vs Networked" — invariants this suite must respect.

## TODO

Phase A — plugin API extension

- Extend `StrandConnectionOptions` in `src/types.ts` with `mode?: 'bootstrap' | 'networked'` and `storage?: IRawStorage` (import the type from `@optimystic/db-p2p`).
- In `src/connect.ts`, compute `resolvedTransactor` from `mode` (with the legacy `transactor` override applying only when `mode` is undefined; default remains `network`).
- In `src/connect.ts`, when the resolved transactor is `local` and `options.storage` is provided, include `rawStorageFactory: () => options.storage!` in the optimystic plugin config (cast through `unknown` to the published parameter type, annotate the cast just like `strand-database.ts:118-121` does).
- In `src/connect.ts`, when `options.storage` is provided and the plugin creates its own libp2p node, pass `storage: options.storage` to `createLibp2pNode`.
- In `src/connect.ts`, broaden the "create libp2p node" gate from `transactor === 'network' || options.libp2pNode` to also cover `mode === 'bootstrap'` (or equivalently: skip only when `resolvedTransactor === 'test'`). Pass `resolvedTransactor` into `setDefaultVtabArgs`.
- Verify the failure path (`catch` block) still releases both the collection factory and the locally-created node; do **not** touch `options.storage` (borrower, not owner).
- `yarn build` and `yarn test` in `packages/quereus-plugin-sereus` — the existing unit suite must still pass unchanged (it uses `transactor: 'test'`, which the new resolution rules must preserve).

Phase B — e2e suite

- Add `@optimystic/db-p2p-storage-fs@^0.13.0` to `packages/quereus-plugin-sereus/package.json` `devDependencies`. `yarn install` at the workspace root.
- Create `test/e2e/bootstrap.e2e.spec.ts` with the four cases above. Use `node:os`, `node:path`, `node:fs/promises`, and `node:crypto`'s `randomUUID`. **Do not** add any `vi.mock` calls in this file.
- Per-test `beforeEach`: build tmp dir, instantiate `FileRawStorage(dir)`. `afterEach`: `await result?.shutdown()`, `db.close()`, then `fs.rm(dir, { recursive: true, force: true })`. Track the active result/db on `this` (or closure refs) so cleanup runs even when a test fails mid-flight.

Phase C — vitest projects config

- Update `vitest.config.ts` to `test.projects: [{ test: { name: 'unit', include: [...] } }, { test: { name: 'e2e', include: ['test/e2e/**/*.spec.ts'], testTimeout: 60_000 } }]`. If the v4 schema rejects this shape, fall back to a sibling `vitest.e2e.config.ts` and split the npm scripts.
- Add `"test:e2e": "vitest run --project e2e"` (or `--config vitest.e2e.config.ts` for the fallback) to `package.json` scripts.
- Confirm `yarn test` (default) runs both projects green; `yarn test:e2e` runs the e2e project only.

Phase D — docs

- README: add `mode` and `storage` rows to the options table; add a "Bootstrap mode" Quick Start example (≤ 10 lines). Note explicitly that the plugin does not close `storage` on `shutdown()`.
- Skim `docs/architecture.md` §"Strand Mode: Bootstrap vs Networked" — only edit if a sentence is now stale because the plugin (not just cadre-core) supports the wiring. Otherwise leave it.

Validation

- `yarn workspace @serfab/quereus-plugin-sereus build` → exit 0.
- `yarn workspace @serfab/quereus-plugin-sereus test 2>&1 | tee /tmp/quereus-plugin-sereus-test.log` — stream output so the 10-minute idle timer doesn't fire if libp2p startup is slow. Both unit and e2e projects green.
- Spot-check the test.log for `mode=bootstrap`-shaped optimystic log lines from the plugin (`Set default vtab to optimystic (...transactor=local)`); the persistence test is meaningless if `transactor` shows `network` or `test`.
