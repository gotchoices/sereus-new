description: Bootstrap-mode strands now hand their persistent `IRawStorage` to the optimystic plugin's local transactor, so DML survives cold restart on solo-node startup.
files:
  - packages/cadre-core/src/strand-database.ts
  - packages/cadre-core/src/strand-instance-manager.ts
  - docs/architecture.md
----

## What shipped

Bootstrap-mode strands previously routed DML through a `MemoryRawStorage` inside the optimystic plugin's local transactor, so any rows inserted while the solo node started up were lost on cold restart. The fix shares the single `IRawStorage` instance the libp2p node was created with into the plugin's `rawStorageFactory`, so writes land on the host's persistent backend (file system on Node, MMKV on React Native, etc.).

### Key changes

- `packages/cadre-core/src/strand-database.ts`
  - `StrandDatabaseConfig` gained an optional `rawStorage?: IRawStorage` field.
  - `initialize()` builds the optimystic plugin config as a mutable map and conditionally adds `rawStorageFactory: () => rawStorage` only when `mode === 'bootstrap'` and `rawStorage` is provided. `networked` mode is unchanged.
  - Init log now includes `persistentStorage=true|false` so the host app can confirm the wiring at runtime.
  - The cast `as unknown as Parameters<typeof optimysticPlugin>[1]` is intentional and annotated — the plugin's published parameter type is `Record<string, SqlValue>` but it also reads a function reference under `rawStorageFactory`.
- `packages/cadre-core/src/strand-instance-manager.ts`
  - `startStrand()` passes the already-resolved `strandStorage` (same instance used for `createLibp2pNode`) into `new StrandDatabase({ ..., rawStorage: strandStorage })`. No second `resolveStrandStorage` call.
  - Public surface (`StartStrandConfig`) is unchanged.
- `docs/architecture.md`
  - Added a "Strand Mode: Bootstrap vs Networked" subsection under "Strand Lifecycle" describing the two modes and the persistent-storage wiring rationale.

### Resource ownership

`StrandDatabase.close()` only shuts down the `collectionFactory` and the `Database`; it does **not** close the storage. The libp2p node owns the storage lifecycle (it was passed in through `createLibp2pNode`) and tears it down through its own stop sequence. This stays correct now that the database also references the same instance — the database is a borrower, not an owner.

## Validation

- `yarn build` (`packages/cadre-core`, via `tsc -p tsconfig.build.json`): exit 0.
- `yarn test` (`packages/cadre-core`, vitest): **10 files / 127 passed**, including:
  - `test/strand-instance-manager.spec.ts` (15 tests) — exercises the modified `startStrand` path.
  - `test/cadre-node.spec.ts` (14 tests) — exercises end-to-end strand add/remove.

The prereq optimystic ticket (`local-transactor-respects-storage-factory`) ships a unit test (`test/local-transactor-storage.spec.ts`) that asserts the plugin's local transactor honours `rawStorageFactory`. A cadre-core-level smoke that re-asserts the same plumbing was deliberately skipped — it would duplicate that coverage and require spinning a real strand for a single field-pass-through assertion.

## How to verify in the host app

Real cold-start persistence validation lives in the host app (sereus-health on Android per the original fix ticket) — it can't be run from cadre-core:

1. Cold-start the app.
2. Insert a row via Quereus through the bootstrap-mode strand.
3. `adb shell am force-stop <package>`
4. Relaunch the app.
5. Row must still be present.

Status: **pending host-app exercise**. Look for `persistentStorage=true` in the strand-db init log to confirm the wiring is active before re-running the persistence check.
