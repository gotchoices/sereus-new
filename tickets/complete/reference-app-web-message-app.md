description: Messages + Activity workload wired onto reference-app-web — solo (LocalTransactor) and distributed (NetworkTransactor) modes, Network panel with persisted bootstrap, mode badge in header
files: packages/reference-app-web/src/lib/optimystic.ts, packages/reference-app-web/src/lib/store.svelte.ts, packages/reference-app-web/src/lib/messages.svelte.ts, packages/reference-app-web/src/lib/network.svelte.ts, packages/reference-app-web/src/App.svelte, packages/reference-app-web/src/Home.svelte, packages/reference-app-web/src/Messages.svelte, packages/reference-app-web/src/Activity.svelte, packages/reference-app-web/README.md, package.json, packages/reference-app-web/package.json
----

## Summary

`@optimystic/demo`'s `MessageApp` (Tree + Diary) is now driven from the
browser reference app through a transactor that switches with the libp2p
node's mode:

- **Solo** (default boot, no bootstrap): `clusterSize=1`, the node's
  `storageRepo` is wrapped in a `LocalTransactor` that bypasses the network
  entirely — writes land in IndexedDB via `IndexedDBRawStorage`.
- **Distributed** (Network panel → Connect with a bootstrap multiaddr):
  `clusterSize=3`, the node's `coordinatedRepo` + `keyNetwork` are wrapped
  in a `NetworkTransactor` (mirroring
  `optimystic/packages/reference-peer/src/cli.ts`'s distributed branch).

The same `Messages` / `Activity` routes work in both modes. A
4-second visibility-gated poll in `messages.svelte.ts:startPolling()` covers
cross-tab convergence in distributed mode; mutations also call `refresh()`
to re-publish the lists immediately.

### Files

- `src/lib/optimystic.ts` — `startNode({bootstrapNodes, clusterSize?})`
  branches on bootstrap presence; `buildLocalTransactor` (solo) and
  `buildNetworkTransactor` (distributed) attach the right transactor. Exposes
  `getTransactor()` / `getMode()` / `getNetworkName()` for the stores.
- `src/lib/store.svelte.ts` — adds `mode` to the reactive node state; adds
  `restart(bootstrapNodes)` for mode switches.
- `src/lib/messages.svelte.ts` — owns the `MessageApp` lifecycle, reactive
  `messages` / `activity` arrays, `ensureReady()` / `refresh()` /
  `addMessage` / `updateMessage` / `deleteMessage` / `startPolling` /
  `stopPolling` / `resetMessageApp`.
- `src/lib/network.svelte.ts` — owns the bootstrap input, persists it to
  IndexedDB via `IndexedDBKVStore` (prefix `optimystic:web-ref:`, key
  `last-bootstrap`), and orchestrates `connect()` / `disconnect()`.
- `src/App.svelte` — extended router for `/messages` and `/log`; mode badge
  in the header (yellow `solo`, green `distributed`).
- `src/Home.svelte` — Network panel: bootstrap input, last-used hint,
  Connect / Disconnect button driven by current mode.
- `src/Messages.svelte` — compose form (author + content), live list,
  inline Edit row, confirm-delete dialog, manual Refresh button, refreshed-at
  timestamp.
- `src/Activity.svelte` — newest-first activity list with `created` /
  `updated` / `deleted` action badges.
- `package.json` (root) + `packages/reference-app-web/package.json` —
  `@optimystic/demo` added as a `link:` resolution and as a dep so the
  browser consumes the unchanged `MessageApp`.
- `packages/reference-app-web/README.md` — rewritten with the solo /
  distributed split, the `optimystic-peer interactive --ws-port 9091
  --no-tcp --relay --offline` recipe, and the two-tab convergence
  acceptance walkthrough.

## Validation

- `tsc --noEmit` — exit 0.
- `svelte-check` — `406 FILES 0 ERRORS 0 WARNINGS`.
- `vite build` — exit 0. Only warnings are the pre-existing chunk-size and
  dynamic-import-also-statically-imported notes from `db-p2p`, identical
  to the scaffold / diagnostics baseline.
- Solo round-trip in a browser (during implement): add → list → edit → delete;
  reload mid-sequence preserves data and peer identity. Activity log shows
  `created` then `updated` newest-first.

### Validation deferred to manual review

The distributed two-tab convergence flow requires a long-lived bootstrap
peer (`optimystic-peer interactive --ws-port 9091 --no-tcp --relay
--offline`) plus two persistent browser tabs, and can't be exercised inside
a single agent invocation. The README walks through it step-by-step.

## Usage

```bash
yarn workspace @serfab/reference-app-web dev      # http://localhost:5173
```

Solo mode boots automatically. To exercise distributed mode, start a local
bootstrap (`optimystic-peer interactive --ws-port 9091 --no-tcp --relay
--offline`), copy its `/ws/.../p2p/...` multiaddr, paste it into Home →
Network → Connect on each tab, then add / edit / delete messages from
either tab and observe convergence within the next poll tick (≤ 4 s) — or
click Refresh for an immediate fetch.

## Out of scope (intentionally deferred)

- Real-time push (gossip / sync subscription wiring) — current cross-tab
  convergence is poll-based.
- Conflict UI for concurrent edits — last-write-wins per Tree semantics.
- Automated browser tests for the libp2p stack — same posture as the
  scaffold / diagnostics tickets; manual smoke is the validation path.
