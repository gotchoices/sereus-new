priority: 4
description: Per-phase timing instrumentation added to CadreNode.start(), StrandInstanceManager.startStrand(), ControlDatabase.initialize(), and StrandDatabase.initialize()
dependencies: none
files:
  - packages/cadre-core/src/cadre-node.ts
  - packages/cadre-core/src/strand-instance-manager.ts
  - packages/cadre-core/src/control-database.ts
  - packages/cadre-core/src/strand-database.ts
----

## What was built

Added `performance.now()`-based timing instrumentation to four cold-start code paths, logged via `debug('sereus:cadre:timing')`. This is observation-only — no control flow changes.

### CadreNode.start() — `cadre-node.ts`

Wraps three phases plus a total:
- `[start] createControlNode` — full libp2p stack creation
- `[start] controlDatabase.initialize` — ControlDatabase construction + init
- `[start] strandWatcher.start` — first poll
- `[start] total` — entire try block

### StrandInstanceManager.startStrand() — `strand-instance-manager.ts`

Wraps two phases plus a total (strand ID in label):
- `[startStrand:<id>] createLibp2pNode`
- `[startStrand:<id>] strandDatabase.initialize`
- `[startStrand:<id>] total`

### ControlDatabase.initialize() — `control-database.ts`

Four sub-phases:
- `[controlDb] cryptoPlugin`
- `[controlDb] optimysticPlugin` (+ vtable/function registration)
- `[controlDb] registerLibp2pNode`
- `[controlDb] loadSchema`

### StrandDatabase.initialize() — `strand-database.ts`

Five sub-phases (strand ID in label):
- `[strandDb:<id>] cryptoPlugin`
- `[strandDb:<id>] optimysticPlugin` (+ vtable/function registration)
- `[strandDb:<id>] registerLibp2pNode`
- `[strandDb:<id>] setDefaultVtab`
- `[strandDb:<id>] executeSchema`

## Testing / validation

- All 25 existing tests pass — no regressions.
- Enable output with `DEBUG=sereus:cadre:timing` env var.
- Timing is observation-only; it wraps existing calls without altering behavior.

## Usage

```bash
# See timing output during integration tests
DEBUG=sereus:cadre:timing yarn test

# In production/dev
DEBUG=sereus:cadre:timing node your-app.js
```
