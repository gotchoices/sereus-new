priority: 1
description: Wire @optimystic/demo MessageApp through NetworkTransactor in the web reference app — Messages and Activity routes, distributed mode against a wss bootstrap peer
prereq: reference-app-web-scaffold
files: packages/reference-app-web/src, ../optimystic/packages/demo/src/message-app.ts, ../optimystic/packages/db-p2p/src/libp2p-key-network.ts, ../optimystic/packages/reference-peer/src/cli.ts
----

With the scaffold running solo, layer on the actual reference workload: the same `MessageApp` (Tree + Diary) the Node demo uses, driven by a `NetworkTransactor` over the browser's libp2p node, so two browser tabs (or a browser tab and the RN app) on the same wss bootstrap converge on the same data.

This is the single most important validation of "Optimystic browser support works end-to-end."

### Cross-repo dependency

Distributed mode requires a browser-reachable bootstrap. The optimystic ticket `../optimystic/tickets/implement/reference-peer-wss-listen.md` adds the `--ws-port` / `--no-tcp` flags to `optimystic-peer`. Coordinate that landing before claiming the distributed-mode acceptance.

### Domain reuse

Import `MessageApp` from `@optimystic/demo` unchanged — it depends only on `@optimystic/db-core` and is browser-safe. Do not redefine the model in this app.

### Wiring

- Add a `Network` panel to the scaffold UI: input for bootstrap multiaddr (e.g. `/dns4/.../tcp/443/wss/p2p/12D...`), Connect / Disconnect buttons. Persist the last-used bootstrap in the IndexedDB `kv` store (via `IndexedDBKVStore`).
- On Connect: stop the solo node if running, start a new node with the bootstrap in `bootstrapNodes` and `clusterSize` raised to a sensible default (e.g. 3), then construct a `NetworkTransactor` (mirror the wiring in `../optimystic/packages/reference-peer/src/cli.ts`'s distributed branch — `Libp2pKeyPeerNetwork`, the node's `coordinatedRepo`, etc.).
- Construct `MessageApp.create(transactor)` once per connected session; tear down on Disconnect.

### Routes (hash-based router or `svelte-spa-router` — pick the lighter one)

- `/` — Messages. Compose form (author + content), live list rendered from `messages.listMessages()` after each mutation. Edit and Delete actions per row.
- `/log` — Activity. Renders `messages.getActivity()` newest-first.

### Reactivity

Use Svelte 5 runes. Wrap `MessageApp` calls in `lib/messages.svelte.ts` holding `$state` for the current message list and activity log; refresh after every write. Polling is acceptable for v1 (a few seconds); real-time delta wiring is a follow-up.

### Multi-tab / cross-app demo

Two browser tabs on the same origin will share IndexedDB-stored network state under different libp2p identities (each tab generates its own — fine for the demo). Both connecting to the same bootstrap should see each other's writes after the next refresh tick. Document this manual test in the README as the headline acceptance check. Bonus: the RN reference app pointed at the same bootstrap should converge on the same data.

### Bootstrap setup

README must include a copy-pasteable local-dev recipe:

```
optimystic-peer start --ws-port 9091 --relay --no-tcp --offline
```

plus how to derive the multiaddr to paste into the UI.

### Acceptance
- Solo mode round-trips: add → list → edit → delete, all persist across reload.
- Distributed mode: tab A writes, tab B sees the write after refresh, both pointing at the same local `optimystic-peer --ws-port 9091 --relay`.
- Activity log mirrors the writes.
- No console errors during normal use; transient connection errors surfaced in the UI rather than silently swallowed.

### Out of scope
- Real-time push (gossip / sync subscription wiring) — backlog.
- Conflict UI for concurrent edits — backlog.

## TODO
- [ ] `Network` panel: bootstrap input, persisted last-used, connect/disconnect lifecycle
- [ ] Build `NetworkTransactor` wiring against the rn-entrypoint node
- [ ] `MessageApp` instance lifecycle tied to connected session (and to solo node when disconnected)
- [ ] Messages route with compose / list / edit / delete
- [ ] Activity route
- [ ] Svelte rune-based reactive stores around `MessageApp`
- [ ] Manual two-tab convergence test against local `optimystic-peer --ws-port`
- [ ] README: setup, bootstrap command, two-tab demo walkthrough
