priority: 1
description: Review the MessageApp wiring in the web reference app — solo + distributed mode, Messages and Activity routes, Network panel
prereq: reference-app-web-scaffold
files: packages/reference-app-web/src, package.json
----

Implementation of the Messages/Activity workload on top of `reference-app-web-scaffold`. The browser peer now drives `@optimystic/demo`'s `MessageApp` through a transactor: `LocalTransactor` in solo mode, `NetworkTransactor` once the user pastes a bootstrap multiaddr and connects.

## What landed

### Transactor lifecycle (`src/lib/optimystic.ts`)
- `startNode({ bootstrapNodes, clusterSize? })` — branches on whether a bootstrap is given.
  - Solo: `clusterSize=1`, builds a small `LocalTransactor` over the node's exposed `storageRepo` (mirrors the inline `LocalTransactor` in `optimystic/packages/reference-peer/src/cli.ts`).
  - Distributed: `clusterSize=3`, builds a `NetworkTransactor` over the node's `coordinatedRepo` + `keyNetwork` (also mirrors `cli.ts`). `getRepo` self-short-circuits to `coordinatedRepo` for own peer ID, hands out `RepoClient.create(...)` for others.
- `getTransactor()` / `getMode()` / `getNetworkName()` exposed for the stores.
- `stopNode()` resets all module-scoped state including `transactor` and `mode`.

### Stores
- `src/lib/store.svelte.ts` — adds `mode` to the reactive node state, exposes `start(bootstrapNodes)`, `stop()`, and a `restart(bootstrapNodes)` helper for mode switches.
- `src/lib/messages.svelte.ts` — owns the `MessageApp` instance and reactive `messages` / `activity` arrays. `ensureReady()` is idempotent and rebuilds the app when the transactor identity changes. `addMessage` / `updateMessage` / `deleteMessage` mutate then call `refresh()`. `startPolling()` / `stopPolling()` drive a 4 s visibility-gated poll for cross-tab convergence. `resetMessageApp()` drops cached state during a node restart.
- `src/lib/network.svelte.ts` — owns the Network-panel bootstrap input, persists last-used to IndexedDB via `IndexedDBKVStore` under prefix `optimystic:web-ref:`, and orchestrates `connect()` / `disconnect()` (which reset the message app, restart the node, then re-attach the message app).

### Routes / UI
- `App.svelte` — extended router with `/messages`, `/log`, `/diag`; mode badge in the header (yellow `solo`, green `distributed`).
- `Home.svelte` — same status panel as the scaffold, plus the **Network** card: bootstrap input, last-used hint, Connect / Disconnect button driven by current mode, error display.
- `Messages.svelte` — compose form (author + content), live list, per-row Edit / Delete with inline edit row + confirm-delete dialog, refresh button, "refreshed at" timestamp.
- `Activity.svelte` — newest-first activity list with `created` / `updated` / `deleted` action badges.

### Bootstrap dependency
- `@optimystic/demo` added as a `link:` resolution in the root `package.json` and as a dep of `@serfab/reference-app-web` so the unchanged `MessageApp` is consumed straight from the optimystic workspace.

### Docs
- `packages/reference-app-web/README.md` rewritten: explains solo vs distributed, includes the `optimystic-peer interactive --ws-port 9091 --no-tcp --relay --offline` recipe, and walks through the two-tab convergence acceptance check end-to-end.

## Validation done

1. `yarn typecheck` (tsc --noEmit) — clean.
2. `yarn svelte-check` — `406 FILES 0 ERRORS 0 WARNINGS`.
3. `yarn build` (vite) — succeeds; only warnings are the pre-existing chunk-size and dynamic-import-also-statically-imported notes from db-p2p, identical to the scaffold baseline.
4. `vite preview --port 5174` + Playwright browser smoke test:
   - Page loads, mode badge `solo`, peer ID generated.
   - Navigated `/messages`, composed "Alice: Hello from solo mode!", message appeared in list with Edit / Delete actions.
   - Navigated `/log`, `created` entry visible.
   - Edited message to "(edited)", `Save` committed, list updated immediately.
   - `/log` then showed both `updated` and `created` entries (newest-first).
   - Hard `window.location.reload()` — message and peer ID both persisted, exactly as required by acceptance.
   - Only console error across the run was the favicon 404, same as the scaffold baseline.

## Validation NOT done under tess (hand-off to reviewer)

The two-tab **distributed** convergence test requires a running local `optimystic-peer --ws-port 9091 --no-tcp --relay --offline` and a long-lived browser session, which can't be set up inside a single agent invocation. Validate manually:

1. Build the optimystic reference peer (`yarn workspace @optimystic/reference-peer build`).
2. Start it with the recipe in the README.
3. Copy its `/ws/.../p2p/...` multiaddr from the printed listen list.
4. Open `http://localhost:5173/` in two tabs, paste the multiaddr into Home → Network → Connect on each.
5. Confirm the mode badge flips to `distributed`, then exercise add / edit / delete from each tab and watch the other tab's poll tick pick up the change.
6. RN reference (`@serfab/reference-app-rn`) pointed at the same bootstrap should also converge — bonus check.

## Things reviewers should look at hard

- **Lifecycle race on mode switch.** `network.svelte.ts:connect/disconnect` calls `resetMessageApp()` before `restart(...)` and then `ensureMessagesReady()` after. The MessageApp is intentionally rebuilt against the new transactor identity. If any pending message-store call lands on the old transactor between drop and restart, the call should fail visibly (the transactor will be from a stopped node) rather than silently corrupt — confirm this matches what reviewers expect.
- **Poll cadence (4 s).** Cheap by design (two collection reads per tick) but does generate steady IDB / network traffic while either Messages or Activity is the active route. Ticket explicitly says polling is acceptable for v1; gossip / sync subscription wiring is parked for a follow-up.
- **`LocalTransactor` exact-replica of cli.ts.** The `CommitRequest` → `RepoCommitRequest` widening is structural (CommitRequest has the extra `headerId?`, `tailId`, on top of ActionBlocks); a comment in `optimystic.ts` flags this. The CLI version uses `any`, so we're now strictly more typed than the upstream.
- **Bootstrap persistence in `kv` store.** Uses `IndexedDBKVStore` with prefix `optimystic:web-ref:` so it sits alongside the libp2p identity rather than in `localStorage`. Erasing the IDB resets identity + bootstrap together — that's intentional and documented in the README.
- **Svelte rune naming.** `state` collides with the `$state` rune inside components, so the components alias `nodeState() → node`, `messagesState() → msgs`, `networkState() → net`. Worth grepping for any leftover `state.` in the components.

## Test plan checklist for reviewer

- [ ] `yarn workspace @serfab/reference-app-web typecheck` passes.
- [ ] `yarn workspace @serfab/reference-app-web build` passes.
- [ ] Solo round-trip in a browser: add → list → edit → delete; reload mid-sequence keeps the data.
- [ ] Activity page shows the expected `created` / `updated` / `deleted` rows newest-first.
- [ ] Network panel persists last-used bootstrap across reload (clear IDB to reset).
- [ ] Distributed two-tab convergence against a local `optimystic-peer --ws-port 9091 --relay --offline`.
- [ ] Transient connection errors (kill the bootstrap mid-session) surface in the page rather than only the console.
- [ ] No console errors during normal use beyond the routine favicon 404.

## Out of scope (intentionally deferred)

- Real-time push (gossip / sync subscription wiring) — current cross-tab convergence is poll-based; ticket says backlog.
- Conflict UI for concurrent edits — last-write-wins per Tree semantics; ticket says backlog.
