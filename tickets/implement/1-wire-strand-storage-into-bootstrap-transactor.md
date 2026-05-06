description: Bootstrap-mode strands now route their resolved raw storage to the optimystic plugin's local transactor so persistent writes survive cold restart.
prereq: local-transactor-respects-storage-factory
files:
  - packages/cadre-core/src/strand-database.ts
  - packages/cadre-core/src/strand-instance-manager.ts
----

## What changed

The strand's resolved `IRawStorage` (already used by the libp2p node) is now also handed to the optimystic plugin in bootstrap mode, where the local transactor IS the data path. Previously bootstrap-mode DML went to an in-process `MemoryRawStorage` and was lost on app kill.

- `StrandDatabaseConfig` gained an optional `rawStorage?: IRawStorage` field.
- When `mode === 'bootstrap'` and `rawStorage` is set, `StrandDatabase.initialize()` adds `rawStorageFactory: () => rawStorage` to the optimystic plugin config (the plugin already reads this — see prereq).
- `StrandInstanceManager.startStrand()` passes the same `strandStorage` instance that goes to `createLibp2pNode` into the new `StrandDatabase`. Sharing the **instance** (not a fresh one over the same id+prefix) avoids cache divergence.
- `networked` mode is unchanged — `rawStorageFactory` is only attached in bootstrap mode.

## Validation done in this stage

- `yarn build` (cadre-core): clean (tsc --noEmit also clean).
- `yarn test` (cadre-core): 127/127 passing, including the existing `StrandInstanceManager.startStrand` and `CadreNode` lifecycle tests that exercise the modified path.

## What the implement stage should confirm

- Re-run `yarn build` and `yarn test` from `packages/cadre-core` — both must remain green.
- Spot-check the diff: the public surface of `StrandInstanceManager` is unchanged; `StrandDatabaseConfig.rawStorage` is the only new field and is optional.
- No new test was added at the cadre-core level. The optimystic prereq already has `local-transactor-storage.spec.ts` covering "writes land on the supplied IRawStorage." A cadre-core test that drives DML through bootstrap mode would duplicate that coverage. Real end-to-end persistence validation lives in the host app (sereus-health on Android per the original ticket): cold-start → insert via Quereus → `adb shell am force-stop` → restart → row must still be present.

## Files touched

- `packages/cadre-core/src/strand-database.ts` — added `rawStorage` to `StrandDatabaseConfig`; conditional `rawStorageFactory` in plugin config; expanded log line.
- `packages/cadre-core/src/strand-instance-manager.ts` — pass `strandStorage` into `new StrandDatabase({ ... })`.
