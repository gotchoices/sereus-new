priority: 4
description: Investigate and reduce cadre cold-start latency — two full libp2p stacks plus two Quereus DBs plus two schema applies run serially on boot
dependencies: packages/cadre-core; optional coordination with optimystic db-p2p (Arachnode skip, profile-aware init)
files:
  - packages/cadre-core/src/cadre-node.ts
  - packages/cadre-core/src/control-database.ts
  - packages/cadre-core/src/strand-instance-manager.ts
  - packages/cadre-core/src/strand-database.ts
  - C:/projects/optimystic/packages/db-p2p/src/libp2p-node-base.ts (reference — Arachnode block)
----
## Context

A sereus-health mobile user reports "cadre creation is really slow" on cold start. Analysis of the `CadreNode.start()` + first `addStrand()` path shows the critical path contains **two full libp2p node bring-ups plus two Quereus databases plus two `optimystic` plugin registrations plus two schema applies**, all serialized:

1. `CadreNode.start()`:
   - `createLibp2pNode()` for the **control** network: Ed25519 keypair, libp2p init with `identify` / `ping` / `gossipsub` / `cluster` / `repo` / `sync` / `networkManager` / `fret` / optional `circuitRelayServer`, `node.start()`, `Libp2pKeyPeerNetwork.initFromPersistedState`, `clusterMember`, `coordinatorRepo`, **Arachnode** setup (`StorageMonitor` + `RingSelector` + `RestorationCoordinator` + 60 s `setInterval`).
   - `new ControlDatabase(...).initialize()`: new Quereus `Database`, register `quereus-plugin-crypto`, register `quereus-plugin-optimystic` (builds a `CollectionFactory`, registers vtables and functions), `loadSchema()` executes the full `CadreControl` DDL.
   - `StrandWatcher.start()` (begins 5 s polling immediately), `HibernationManager.start()`, background `scheduleSelfRegistration` (currently a no-op).
2. `addStrand()`:
   - `createLibp2pNode()` for the **strand** network — a second full libp2p stack.
   - `new StrandDatabase(...).initialize()` — a second Quereus database, a second crypto + optimystic plugin registration, a second `CollectionFactory`, then `declare schema App { ... } apply schema App` against the sApp schema.

In the sereus-health app, `CadreService.doStart()` calls `addStrand` inside the start path, so every screen — including ones that only need the control database (e.g. SereusConnections) — blocks on all of the above. Per-stage timing logs have already been added to `apps/mobile/src/services/CadreService.ts` on that side; similar instrumentation inside `cadre-node.ts` and `strand-instance-manager.ts` would let us see whether the issue is libp2p init, plugin registration, or schema apply.

This ticket is **measurement first**. Speculating about which step dominates is not useful; the answer is in the logs. Capture a baseline before touching any code.

## Hypotheses to validate against real measurements

- **Two libp2p nodes dominate.** Each instance generates an Ed25519 keypair, wires up ~10 services, and starts a 60 s Arachnode `setInterval`. If true, the biggest wins are (a) lazy strand bring-up in consumers (they can call `addStrand` on-demand rather than at boot) or (b) parallelizing control + strand libp2p starts within cadre-core.
- **Arachnode init is a meaningful tax on the `transaction` profile.** `arachnode.enableRingZulu` defaults to true, and `StorageMonitor` + `RingSelector.createArachnodeInfo()` read storage stats during `createLibp2pNodeBase`. For a phone with a single local strand and no remote peers this is pure overhead. Skipping Arachnode entirely for `profile: 'transaction'` is a natural shortcut and belongs in a coordinated optimystic/db-p2p change.
- **Quereus plugin registration duplicated.** The crypto plugin and the optimystic plugin are registered twice (once per `Database`), and each `optimysticPlugin(db, ...)` call builds its own `CollectionFactory`. If plugin init is non-trivial, consider whether one shared plugin state (or at least one shared collection factory) can serve both the control DB and the strand DB. This might require a small Quereus API change.
- **Schema apply is re-run every start.** `apply schema CadreControl` (6 tables with `verify()` / `digest()` constraint checks) and `apply schema App` (the sApp health schema) run on every boot. Quereus' `apply` is supposed to no-op when there is no diff; confirm that's actually what happens for schemas already materialized in optimystic storage. If it does redundant work, a cached "schema fingerprint" stored alongside the strand would let us skip the apply on the hot path.
- **StrandWatcher starts polling immediately.** For a single-device cadre with no remote peers the 5 s poll contributes nothing useful during boot. Delaying the first poll by a few seconds would keep the main thread free during startup.

## Possible interventions (apply after measurements)

Roughly ordered by expected ROI per effort, to be split into separate `implement/` tickets once the baseline numbers confirm which are worth doing:

1. **Support lazy strand bring-up in cadre-core.** `CadreNode.start()` doesn't itself call `addStrand` — that's the consumer's call. But cadre-core should make it easy for consumers to defer: document the pattern in `docs/cadre-architecture.md`, and make sure `StrandWatcher` does not kick in late-arriving `addStrand` calls weirdly. (Consumers like sereus-health currently call `addStrand` eagerly inside their `ensureStarted`; they can move it behind a separate `ensureStrandReady()` call — that's a consumer-side ticket, but cadre-core should not make it hard.)
2. **Parallelize control DB init with strand libp2p bring-up.** Today `CadreNode.start()` sequences `createControlNode()` → `new ControlDatabase().initialize()` → watcher start. If `addStrand` is called next, its libp2p creation could begin as soon as the control libp2p node is up, overlapping with the control DB's plugin registration and schema apply. This is an intra-`cadre-core` refactor, not a public-API change.
3. **Profile-aware Arachnode skip.** In db-p2p `libp2p-node-base.ts`, `enableArachnode` defaults to `options.arachnode?.enableRingZulu ?? true`. Add a path that treats `fretProfile: 'edge'` or a new `profile: 'transaction'` hint as "skip Arachnode and its interval entirely." Coordinate with optimystic (separate ticket in that repo).
4. **Defer the StrandWatcher first poll.** Bump the first poll by ~2 seconds and log when the first poll actually runs, so it doesn't fight for the JS thread during startup.
5. **Cache schema fingerprint.** If `apply schema App` measurably re-validates the schema every launch, store a hash of the DDL text alongside the strand metadata and skip the apply when it matches. Requires care: needs to be invalidated when the sApp version changes.
6. **Share crypto-plugin / optimystic-plugin registrations between control and strand DBs**, if Quereus permits. Today each `Database` instance gets its own copy; look into whether a shared module registration is possible.

## Tests / validation

- Capture a timing baseline: add `debug()` timing logs around each major phase in `CadreNode.start()` and `StrandInstanceManager.startStrand()`. Cold start the reference app three times, record the numbers, paste them into this ticket as "before."
- After each intervention, re-capture and report the delta in the corresponding `implement/` ticket.
- Regression coverage: the reference app should still pass its existing smoke scenario (start node → form strand → send a message). Any lazy-bring-up change has the highest regression risk and needs explicit coverage.

## TODO

- Add per-phase `debug('sereus:cadre:timing', ...)` logs inside `cadre-node.ts start()` (split: `createControlNode`, `controlDatabase.initialize`, `watcher.start`) and `strand-instance-manager.ts startStrand()` (split: `createLibp2pNode`, `strandDatabase.initialize` split further into plugin registration vs schema apply)
- Capture three cold-start timings from `packages/reference-app-rn` using the new logs — paste into this ticket as baseline before any code changes
- Decide, based on the baseline, which of the interventions above are worth splitting into `implement/` tickets
- Reasonable starting bet (subject to measurement): lazy strand bring-up guidance + profile-aware Arachnode skip (coordinated with the optimystic side)
- Coordinate with the optimystic repo for any `createLibp2pNodeBase` changes needed (e.g. a new `skipArachnode` option or a `profile: 'transaction'` shortcut)
- After `implement/` tickets land, re-capture three cold-start timings and confirm the improvement in the corresponding review tickets
