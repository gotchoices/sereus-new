priority: 4
description: Per-phase timing instrumentation for cadre cold-start code paths
files:
  - packages/cadre-core/src/cadre-node.ts
  - packages/cadre-core/src/strand-instance-manager.ts
  - packages/cadre-core/src/control-database.ts
  - packages/cadre-core/src/strand-database.ts
----

## Summary

Added `performance.now()`-based timing instrumentation to four cold-start code paths, logged via `debug('sereus:cadre:timing')`. Observation-only — no control flow changes.

### Instrumented phases

- **CadreNode.start()**: `createControlNode`, `controlDatabase.initialize`, `strandWatcher.start`, total
- **StrandInstanceManager.startStrand()**: `createLibp2pNode`, `strandDatabase.initialize`, total (strand ID in label)
- **ControlDatabase.initialize()**: `cryptoPlugin`, `optimysticPlugin`, `registerLibp2pNode`, `loadSchema`
- **StrandDatabase.initialize()**: `cryptoPlugin`, `optimysticPlugin`, `registerLibp2pNode`, `setDefaultVtab`, `executeSchema` (strand ID in label)

## Usage

```bash
DEBUG=sereus:cadre:timing yarn test
DEBUG=sereus:cadre:timing node your-app.js
```

## Testing

All 127 existing cadre-core tests pass. No dedicated timing tests needed — instrumentation is observation-only debug logging with zero behavioral impact.
