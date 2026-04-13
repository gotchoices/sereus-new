priority: 4
description: Add per-phase timing instrumentation to CadreNode.start() and StrandInstanceManager.startStrand() to establish cold-start baseline
dependencies: none
files:
  - packages/cadre-core/src/cadre-node.ts
  - packages/cadre-core/src/strand-instance-manager.ts
  - packages/cadre-core/src/control-database.ts
  - packages/cadre-core/src/strand-database.ts
----

## Context

Cold-start latency is reported as slow on mobile. Before optimizing, we need per-phase timing data so we can direct effort at the actual bottleneck rather than guessing.

All timing logs use the existing `debug` module under a `sereus:cadre:timing` namespace. They use `performance.now()` (available in Node, RN, and browsers) for sub-millisecond resolution. Each log line reports the phase name and elapsed milliseconds.

## Instrumentation Points

### CadreNode.start() (`cadre-node.ts`, lines 136–197)

Add timing around each sequential phase inside the `try` block:

- **createControlNode** (line 146): `this.createControlNode()` — includes full libp2p stack creation
- **controlDatabase.initialize** (lines 156–163): `new ControlDatabase(...)` + `initialize()`
- **strandWatcher.start** (line 180): `strandWatcher.start()` — includes the immediate first poll
- **total start()**: wrap the entire try block

### StrandInstanceManager.startStrand() (`strand-instance-manager.ts`, lines 127–232)

Add timing around:

- **createLibp2pNode** (lines 187–206): the second full libp2p stack creation
- **strandDatabase.initialize** (lines 211–218): `new StrandDatabase(...)` + `initialize()`
- **total startStrand**: wrap the full method

### ControlDatabase.initialize() (`control-database.ts`, lines 188–235)

Add timing around:

- **registerPlugin(cryptoPlugin)** (line 200)
- **optimysticPlugin(db, ...)** + vtable/function registration (lines 205–218)
- **registerLibp2pNode** (lines 222–228)
- **loadSchema** (line 231): this includes `db.exec(CONTROL_SCHEMA)` with the `apply schema CadreControl`

### StrandDatabase.initialize() (`strand-database.ts`, lines 56–118)

Add timing around:

- **registerPlugin(cryptoPlugin)** (line 72)
- **optimysticPlugin(db, ...)** + vtable/function registration (lines 77–98)
- **registerLibp2pNode** (line 99)
- **setDefaultVtab** (lines 105–111)
- **executeSchema** (line 114): this includes `declare schema App { ... } apply schema App`

## Log Format

```
sereus:cadre:timing  [start] createControlNode: 1234ms
sereus:cadre:timing  [start] controlDatabase.initialize: 567ms
sereus:cadre:timing  [start] strandWatcher.start: 89ms
sereus:cadre:timing  [start] total: 1890ms
sereus:cadre:timing  [startStrand:<id>] createLibp2pNode: 1100ms
sereus:cadre:timing  [startStrand:<id>] strandDatabase.initialize: 450ms
sereus:cadre:timing  [startStrand:<id>] total: 1550ms
sereus:cadre:timing  [controlDb] cryptoPlugin: 12ms
sereus:cadre:timing  [controlDb] optimysticPlugin: 45ms
sereus:cadre:timing  [controlDb] registerLibp2pNode: 3ms
sereus:cadre:timing  [controlDb] loadSchema: 89ms
sereus:cadre:timing  [strandDb:<id>] cryptoPlugin: 11ms
sereus:cadre:timing  [strandDb:<id>] optimysticPlugin: 44ms
sereus:cadre:timing  [strandDb:<id>] registerLibp2pNode: 2ms
sereus:cadre:timing  [strandDb:<id>] executeSchema: 78ms
```

## Tests

- Existing tests should continue to pass — timing logs are observation-only and don't alter control flow.
- Verify that `DEBUG=sereus:cadre:timing` produces output by running the integration test suite with that env var.

## TODO

- Add `const timing = debug('sereus:cadre:timing')` to cadre-node.ts, strand-instance-manager.ts, control-database.ts, and strand-database.ts
- Wrap each phase in `const t0 = performance.now()` / `timing(...)` pairs in CadreNode.start()
- Wrap each phase in StrandInstanceManager.startStrand()
- Wrap each phase in ControlDatabase.initialize()
- Wrap each phase in StrandDatabase.initialize()
- Run build (`yarn build`) and tests (`yarn test`) to confirm no regressions
