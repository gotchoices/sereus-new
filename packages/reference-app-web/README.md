# @serfab/reference-app-web

Svelte 5 + Vite SPA exercising the Optimystic libp2p stack in a browser. This
is the browser counterpart to `@serfab/reference-app-rn` (which targets phones
via React Native), and the validation surface for "Optimystic actually works
in a browser."

The app boots a libp2p node in solo mode by default, persists an Ed25519
identity across reloads, and drives `@optimystic/demo`'s `MessageApp`
(Tree + Diary) through a transactor — local in solo mode, distributed via
`NetworkTransactor` once you connect to a bootstrap peer. The same domain
model is exercised by the Node reference peer; two browser tabs (or a tab
plus the RN reference app) on the same bootstrap converge on the same data.

## Run

```bash
yarn workspace @serfab/reference-app-web dev      # dev server on :5173
yarn workspace @serfab/reference-app-web build    # static SPA bundle in dist/
yarn workspace @serfab/reference-app-web preview  # serve the built bundle
```

On first page load the app generates a fresh Ed25519 keypair, stores it in
IndexedDB (`sereus-web-reference` database, `kv` object store), and starts a
solo libp2p node. Reload preserves the peer ID. Delete the IndexedDB
database from DevTools → Application → Storage to rotate the identity (this
also clears stored messages and the last-used bootstrap).

## Routes

- `#/` — **Home** — node status, peer ID, mode badge, Restart, and the
  **Network panel** for connecting to a bootstrap.
- `#/messages` — compose / list / edit / delete messages backed by
  `MessageApp.messages` (a `Tree<string, Message>`).
- `#/log` — activity log backed by `MessageApp.activity` (a `Diary<Activity>`),
  newest first.
- `#/diag` — diagnostics surface (see below).

## Modes: solo vs distributed

**Solo** (default): no bootstrap, `clusterSize=1`. The store wires a
`LocalTransactor` against the node's local `storageRepo` so writes hit
IndexedDB directly. Useful for offline development, identity persistence
checks, and reading the entire stack without a network. Solo round-trips
add → list → edit → delete and the data survives reload.

**Distributed**: paste a bootstrap multiaddr into the Network panel and hit
**Connect**. The store stops the solo node, restarts with `bootstrapNodes`
populated and `clusterSize=3`, and wraps the node's `coordinatedRepo` in a
`NetworkTransactor` (mirroring `optimystic/packages/reference-peer/src/cli.ts`'s
distributed branch). The last-used bootstrap is persisted in IndexedDB
(`kv` store, key `optimystic:web-ref:last-bootstrap`) and pre-filled on
reload. **Disconnect** drops the connection and snaps back to solo mode.

The mode badge in the header and the Mode row on Home reflect the current
state.

### Connecting to a local bootstrap

A browser tab can only dial WebSocket transports. The optimystic
`reference-peer` exposes a `/ws` listener via `--ws-port`:

```bash
# In the optimystic repo
yarn workspace @optimystic/reference-peer build
node packages/reference-peer/dist/src/cli.js interactive \
  --ws-port 9091 \
  --no-tcp \
  --relay \
  --offline
```

`--ws-port 9091` adds `/ip4/0.0.0.0/tcp/9091/ws` to the listen set,
`--no-tcp` drops the default TCP listener so the bootstrap is browser-only,
`--relay` turns on circuit-relay-v2 (useful once a second browser tab joins),
and `--offline` keeps the bootstrap from trying to form its own cluster.

The peer prints its listen addrs on startup; copy the `/ws` line, append
`/p2p/<peerId>` if it's not already on the line, and paste it into the
Network panel. Typical shape:

```
/ip4/127.0.0.1/tcp/9091/ws/p2p/12D3KooW...
```

For a real (non-`--offline`) cluster, drop `--offline` and bring up
additional service nodes — see the optimystic repo for cluster recipes.

### Two-tab convergence test (acceptance check)

1. Start the local bootstrap as above (`--ws-port 9091 --relay --offline`).
2. Open the dev server (`yarn workspace @serfab/reference-app-web dev`) in
   two browser tabs at `http://localhost:5173/`.
3. In tab A: paste the bootstrap multiaddr into the Network panel and click
   **Connect**. Wait for the mode badge to flip to `distributed`.
4. In tab B: do the same. Each tab generates its own libp2p identity.
5. In tab A: navigate to **Messages**, send a message.
6. In tab B: navigate to **Messages**. The next poll tick (≤ 4 s) brings the
   message into view, or click **Refresh** to force an immediate fetch.
7. Edit / delete from either tab and confirm the other tab sees the change.
8. Both tabs' **Activity** pages should show the same entries.

Bonus: point the RN reference app (`@serfab/reference-app-rn`) at the same
bootstrap and confirm cross-runtime convergence.

## Architecture

```
src/
  App.svelte             # nav + hash route switcher (Home, Messages, Activity, Diagnostics)
  Home.svelte            # node status + Network panel (bootstrap input, connect/disconnect)
  Messages.svelte        # /messages — compose / list / edit / delete
  Activity.svelte        # /log — newest-first activity diary
  Diagnostics.svelte     # /diag — diagnostic surface
  main.ts                # mount + polyfill bootstrap
  polyfills.ts           # Buffer global + timer .ref/.unref shim
  main.css               # global styles
  lib/
    optimystic.ts            # libp2p node + transactor lifecycle (solo: LocalTransactor, distributed: NetworkTransactor)
    store.svelte.ts          # Svelte 5 runes wrapper around the node singleton
    network.svelte.ts        # bootstrap input + IndexedDB persistence + connect/disconnect
    messages.svelte.ts       # MessageApp wrapper — reactive messages / activity lists + polling
    router.svelte.ts         # tiny hash-based router (#/, #/messages, #/log, #/diag)
    diagnostics.svelte.ts    # tick-driven snapshot store powering /diag
    Copyable.svelte          # copy-to-clipboard chip used in /diag
  shims/
    empty.ts             # vite alias target for node:os / node:net / node:tls
```

### Transactor lifecycle

`lib/optimystic.ts` owns one libp2p node at a time. `startNode()` reads the
bootstrap list:

- **No bootstrap** → solo: `clusterSize=1`, transactor = `LocalTransactor`
  wrapping the node's `storageRepo`.
- **Bootstrap given** → distributed: `clusterSize=3`, transactor =
  `NetworkTransactor` over the node's `coordinatedRepo` + `keyNetwork`.

Switching modes goes through `stopNode()` → `startNode(...)`. The
`MessageApp` is bound to a specific transactor instance, so
`network.svelte.ts` calls `resetMessageApp()` before each restart and
`ensureReady()` after, which rebuilds the app against the fresh transactor.

### Reactivity

Svelte 5 runes (`$state` + `$effect`) hold the reactive shape. Mutations go
through the messages store, which then calls `refresh()` to re-read both
collections and re-publishes the arrays. A 4-second visibility-gated poll in
`messages.svelte.ts:startPolling()` covers cross-tab convergence; real-time
gossip / sync subscription wiring is a backlog item.

## Diagnostics (`#/diag`)

Polls every two seconds while the tab is visible; pauses under
`document.visibilityState !== 'visible'`. Surfaces:

- **Identity** — peer ID, persistence badge, first-seen timestamp and age.
- **Connectivity** — node status, listen multiaddrs (empty in browser
  peers), per-connection peer ID / remote multiaddr / direction / open
  protocols.
- **Transports** — names of registered libp2p transports. In a healthy
  browser bundle this is exactly `WebSockets, circuit-relay-v2`.
- **FRET** — known peer count, network size estimate, churn, partition,
  Arachnode ring membership.
- **Storage** — `IndexedDBRawStorage`, `navigator.storage.estimate()` quota
  / usage, raw approximate bytes, per-object-store row counts.
- **Crypto sanity** — seven boolean checks for the host APIs the libp2p
  stack reaches for.
- **Recent errors** — a ten-deep ring buffer fed by the start/stop catch
  blocks, per-connection `close` events, and global `error` /
  `unhandledrejection` window events.

### Debugging recipes

- **"Why won't my browser tab dial the bootstrap?"** Open `#/diag`.
  Connectivity → status should be `running` and Transports must include
  `WebSockets`. If a multiaddr is listed under Connections but Protocols is
  empty, the dial succeeded but no application protocol has streamed yet —
  give it a few seconds and click Refresh.
- **"Did my identity persist?"** Identity → Persisted should read
  `persisted ✓` and the first-seen timestamp must not change on reload.
- **"Did Optimystic accidentally pull in TCP?"** Transports list. The
  browser bundle must show `WebSockets, circuit-relay-v2` only.

## Vite config notes

Browsers natively provide `crypto.subtle`, `EventTarget`, `ReadableStream`,
`structuredClone`, `Promise.withResolvers`, `AbortSignal.throwIfAborted`,
and `TextEncoder`/`Decoder`, so the polyfill surface is much smaller than
RN.

`vite.config.ts` aliases only the Node built-ins that transitive libp2p
deps reach for — `os`, `net`, `tls` → empty shim; `stream` →
`readable-stream`; `buffer` → npm `buffer`. **`node:crypto` / `crypto` are
deliberately not aliased**: anything reaching for them in a browser bundle
is a real bug we want surfaced.

`src/polyfills.ts` handles the two residual gaps that even modern browsers
don't cover:

- `globalThis.Buffer` — wired to the npm `buffer` package.
- `setTimeout` / `setInterval` return values with no-op `.ref()` /
  `.unref()`. Node-targeting libraries (db-p2p's ClusterMember, libp2p
  internals) call `.unref()` on timer handles; browsers return plain
  numbers.

If you discover another missing API, add it to `polyfills.ts` with a
comment explaining which package needs it — do not introduce a `crypto`
shim.

## Browser support

- **Chromium / Chrome**: primary development target.
- **Firefox**: should work — relies only on standard APIs (WebSocket,
  IndexedDB, WebCrypto, `crypto.subtle`). Smoke-check before relying on
  it.
- **Safari**: untested. `@optimystic/db-p2p-storage-web` targets Safari 14+.
  Smoke-check before relying on it.

If anything fails in Firefox / Safari, capture the console error and file
a fix ticket rather than papering it over with a shim — the same applies
as for `crypto`.

## Out of scope (for follow-up)

- Real-time push (gossip / sync subscription wiring) — the current
  cross-tab convergence is poll-based.
- Conflict UI for concurrent edits — last-write-wins per the underlying
  Tree semantics.
