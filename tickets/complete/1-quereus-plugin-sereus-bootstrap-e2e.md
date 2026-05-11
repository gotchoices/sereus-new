description: Bootstrap-mode wiring in `connectToStrand` plus an e2e suite that drives a real libp2p node and `FileRawStorage` through the plugin. Closes the cold-start persistence loop deferred from `1-wire-strand-storage-into-bootstrap-transactor`.
files:
  - packages/quereus-plugin-sereus/src/types.ts
  - packages/quereus-plugin-sereus/src/connect.ts
  - packages/quereus-plugin-sereus/test/e2e/bootstrap.e2e.spec.ts
  - packages/quereus-plugin-sereus/test/plugin.spec.ts
  - packages/quereus-plugin-sereus/vitest.config.ts
  - packages/quereus-plugin-sereus/package.json
  - packages/quereus-plugin-sereus/README.md
----

## What shipped

### Public API

`StrandConnectionOptions` (`src/types.ts:5-45`) gained:

- `mode?: 'bootstrap' | 'networked'` — `'networked'` (default) → network transactor; `'bootstrap'` → local transactor, no peer round trips.
- `storage?: IRawStorage` — borrowed persistent raw storage. Handed to `createLibp2pNode` as `storage`, and in `mode: 'bootstrap'` also wired into the optimystic plugin via `rawStorageFactory: () => storage` so DML through the local transactor lands on the same backing store as the libp2p data path (mirrors `cadre-core/strand-database.ts:106-122`).

The legacy `@internal transactor` override survives for unit-test `transactor: 'test'`. Precedence: `mode` wins; legacy override only applies when `mode` is unspecified (`src/connect.ts:53-60`). Node-creation gate (`src/connect.ts:106`) is `resolvedTransactor !== 'test' || options.libp2pNode` — skip libp2p creation only for the fake unit-test transactor; bootstrap (which resolves to `'local'`) gets a real node.

Borrower contract: `shutdown()` releases the libp2p node and collection factory; `options.storage` is **never** closed.

### e2e suite

`test/e2e/bootstrap.e2e.spec.ts` runs real libp2p + real `FileRawStorage` (no `vi.mock` — the sibling unit spec's mock is file-scoped). Four cases:

1. **CRUD round-trip** in one bootstrap connection (insert/select/update/delete against `App.Msg`).
2. **Persistence across reopen** (headline) — `Database` #1 writes `(42, 'persisted')`, shuts down. `Database` #2 over the same dir + same `strandId` reads it back. Closes the cold-start loop deferred by `tickets/complete/1-wire-strand-storage-into-bootstrap-transactor.md`.
3. **Schema-less bootstrap rejects `App.*`** (guards against accidental default-vtab auto-creation regressions).
4. **Three open/close cycles** over one storage path (catches file-lock / libp2p socket leaks that only show on the second cycle).

Per-test isolation: tmp dir under `os.tmpdir()/sereus-plugin-e2e/<uuid>`, random `strandId` per test, `afterEach` runs `shutdown()` → `db.close()` → `fs.rm(dir)`. Errors during shutdown/close are logged via `console.error` so tmpdir cleanup always runs.

### Vitest projects + scripts

`vitest.config.ts` switched to `test.projects` with two projects:

- `unit` — `test/**/*.spec.ts` excluding `test/e2e/**`, default 5s timeout.
- `e2e` — `test/e2e/**/*.spec.ts`, 60s timeout (cold libp2p startup is slow on Windows).

`package.json:44-46`:
- `yarn test` — both projects.
- `yarn test:e2e` — `vitest run --project e2e`.

### Docs

`README.md` got a "Bootstrap mode" Quick Start example, `mode` and `storage` rows in the options table, and `yarn test:e2e` in the dev section. `docs/architecture.md` "Strand Mode: Bootstrap vs Networked" already covered the conceptual model at the `StrandDatabase` level; left as-is.

## Validation

- `yarn workspace @serfab/quereus-plugin-sereus build` → exit 0.
- `yarn workspace @serfab/quereus-plugin-sereus test` → 25/25 green (21 unit + 4 e2e), ~5s total.

## Usage

```typescript
import { Database } from '@quereus/quereus';
import { FileRawStorage } from '@optimystic/db-p2p-storage-fs';
import { connectToStrand } from '@serfab/quereus-plugin-sereus';

const storage = new FileRawStorage('./data/my-strand');
const db = new Database();
const strand = await connectToStrand(db, {
  strandId: 'abc',
  mode: 'bootstrap',
  storage,
  schema: 'table Msg (Id integer primary key, Body text not null)',
});

await db.exec(`insert into App.Msg(Id, Body) values (1, 'hello')`);

await strand.shutdown();  // storage is borrowed — caller closes it
```

## Known follow-up (parked, not blocker)

- `connectToStrand` and `StrandDatabase.initialize` (`packages/cadre-core/src/strand-database.ts:106-122`) now mirror the same bootstrap wiring. Consolidation was explicitly deferred in this ticket — revisit if a third consumer appears or the plugin's published signature gets a typed `rawStorageFactory` slot (would let both sites drop the `unknown` cast).
