description: Review wiring of strand IRawStorage into the optimystic plugin's local transactor for bootstrap-mode strands.
files:
  - packages/cadre-core/src/strand-database.ts
  - packages/cadre-core/src/strand-instance-manager.ts
----

## What was implemented

Bootstrap-mode strands now hand the resolved `IRawStorage` (the same instance the libp2p node was created with) to the optimystic plugin so its local transactor writes to the host's persistent storage instead of an in-memory `MemoryRawStorage`. Without this, DML executed in bootstrap mode (the solo-node startup path) was lost on cold restart.

### Code changes

- `packages/cadre-core/src/strand-database.ts`
  - `StrandDatabaseConfig` gained an optional `rawStorage?: IRawStorage` field (documented as the same instance the libp2p node uses — sharing the instance avoids cache divergence).
  - `initialize()` builds the optimystic plugin config as a mutable `Record<string, unknown>` and conditionally adds `rawStorageFactory: () => rawStorage` only when `mode === 'bootstrap'` and `rawStorage` is provided.
  - The cast through `unknown` is intentional: the plugin's published parameter type is `Record<string, SqlValue>` but the plugin also reads a function reference under `rawStorageFactory`. A tighter local type was avoided rather than widening the public type.
  - Log line expanded to include `persistentStorage=` so it is visible whether the bootstrap path is using host storage.
  - `networked` mode is unchanged: `rawStorageFactory` is never attached.
- `packages/cadre-core/src/strand-instance-manager.ts`
  - `startStrand()` passes `strandStorage` (the same instance handed to `createLibp2pNode`) into `new StrandDatabase({ ..., rawStorage: strandStorage })`. No new resolution call — the existing `resolveStrandStorage(...)` result is shared.
  - Public surface of `StrandInstanceManager` is unchanged.

### Validation done in implement stage

- `yarn build` (cadre-core, via `tsc -p tsconfig.build.json`): exit 0.
- `yarn test` (cadre-core, vitest): 10 files / **127 passed**, including `test/strand-instance-manager.spec.ts` (15) and `test/cadre-node.spec.ts` (14) which exercise the modified `startStrand` path.

## What review should check

### Interface review (look first, before reading bodies)

- `StrandDatabaseConfig.rawStorage` is optional and documented; no breaking change.
- `StartStrandConfig` was **not** modified — `mode` and `storage` already existed. The new wiring is purely internal to `startStrand`.
- The optimystic plugin's prereq (`local-transactor-respects-storage-factory`) is what actually reads `rawStorageFactory`. Confirm the field name matches what the plugin expects (it does — see the prereq's `local-transactor-storage.spec.ts`).

### Aspect-oriented checks

- DRY: `strandStorage` is resolved once in `startStrand` and shared between `createLibp2pNode` and `StrandDatabase`. Don't duplicate the factory call.
- Modularity: bootstrap-only branch is isolated to a single `if` in `StrandDatabase.initialize()`. No conditional sprawl.
- Cross-platform: no Node-only APIs introduced. The deprecated `getStrandStoragePath` remains the only Node-gated helper and was untouched.
- Resource cleanup: shared instance means `StrandDatabase.close()` should NOT close the storage (the libp2p node owns lifecycle of that instance via its own teardown). Verify this stays true — `close()` only shuts down the `collectionFactory` and the `Database`, not the storage.
- Logging: `persistentStorage=true|false` flag in the init log is sufficient signal in the field. No PII / no key material logged.
- Type safety: the `as unknown as Parameters<typeof optimysticPlugin>[1]` cast is the only `any`/`unknown` widening and is annotated with rationale.

### Tests

- No new cadre-core test was added. Justification: the prereq optimystic ticket has `local-transactor-storage.spec.ts` covering "writes land on the supplied IRawStorage." A cadre-core test driving DML through bootstrap mode would duplicate that coverage and require spinning a real strand. If the reviewer disagrees, a targeted unit test could assert that `StrandDatabase` constructed with `mode: 'bootstrap'` + a recording `IRawStorage` results in `rawStorageFactory` being invoked exactly once during `initialize()`. (No such test exists today.)
- Existing tests that traverse this path: `test/strand-instance-manager.spec.ts` (`startStrand should start a strand instance with sApp info`, etc.) and `test/cadre-node.spec.ts` (`strand management should manually add and remove strands`).

### End-to-end (out of scope for review's automated run, documented for tracking)

Real cold-start persistence validation happens in the host app (sereus-health on Android per the original fix ticket):

1. cold-start the app
2. insert a row via Quereus through the bootstrap-mode strand
3. `adb shell am force-stop <package>`
4. relaunch
5. row must still be present

This is host-app territory and not runnable from cadre-core. Note in the complete ticket that this verification is **pending host-app exercise** if not already done.

### Docs

- `docs/architecture.md` — verify whether the bootstrap-vs-networked transactor distinction is documented; if it is, ensure the persistent-storage wiring is mentioned. If it is not yet documented, this is a small doc gap worth closing in this pass.

## TODO

- Re-run `yarn build` and `yarn test` from `packages/cadre-core` and confirm green.
- Walk the diff of the two files against the interface-review and aspect-oriented checks above.
- Confirm `docs/architecture.md` reflects the bootstrap-mode persistence wiring; update if stale.
- Decide whether to add the unit test described under "Tests" above. Default: skip (would duplicate the optimystic-side coverage); add only if the reviewer wants a cadre-core-level smoke.
- On pass, move ticket to `complete/` with a short summary (what shipped, key files, how to verify in the host app).
