description: Diagnostics route (`/diag`) layered onto reference-app-web — seven cheap-poll sections covering identity, connectivity, transports, FRET, storage, crypto sanity, and a libp2p error ring buffer
files: packages/reference-app-web/src/App.svelte, packages/reference-app-web/src/Home.svelte, packages/reference-app-web/src/Diagnostics.svelte, packages/reference-app-web/src/lib/diagnostics.svelte.ts, packages/reference-app-web/src/lib/router.svelte.ts, packages/reference-app-web/src/lib/Copyable.svelte, packages/reference-app-web/src/lib/optimystic.ts, packages/reference-app-web/src/lib/store.svelte.ts, packages/reference-app-web/README.md
----

## What was built

A `/diag` hash-route on top of the scaffold's minimal home page, populated by
a 2-second tick that pauses under `document.visibilityState !== 'visible'`.
The tick runs only cheap probes — `node.getConnections()`,
`fret.listPeers()`, `db.count(...)`, `navigator.storage.estimate()`,
`storage.getApproximateBytesUsed()`. No network round-trips.

### Files added

```
packages/reference-app-web/src/
  App.svelte                      # nav header + hash route switch
  Home.svelte                     # extracted from previous App.svelte (status, peer id, restart)
  Diagnostics.svelte              # seven-section read-only diagnostics view
  lib/
    diagnostics.svelte.ts         # tick store + error ring buffer + start/stop lifecycle
    router.svelte.ts              # hash router (#/, #/diag, ...) with $state route
    Copyable.svelte               # click-to-copy chip for peer IDs / multiaddrs
```

### Files modified

- `src/lib/optimystic.ts`
  - Tracks an `identity-first-seen` timestamp in the `kv` store (best-effort
    age figure — not the real key creation time for upgrade-path identities,
    which is documented in the source).
  - Now also exposes `getDb()` and `getStorage()` so `diagnostics.svelte.ts`
    can read object-store counts and the raw approximate-bytes-used.
- `src/lib/store.svelte.ts` — feeds the diagnostics error ring buffer when
  `start()` / `stop()` catches throw.
- `README.md` — new "Diagnostics (`#/diag`)" section enumerates the seven
  panels and lists four common debugging recipes; file layout updated.

### Sections rendered on `/diag`

1. **Identity** — peer ID (full + short, both copyable), persisted badge,
   first-seen timestamp + age duration.
2. **Connectivity** — node `status`, listen multiaddrs (empty in solo
   mode), per-connection table (peer ID, remote multiaddr, direction, open
   protocols pulled from `connection.streams[].protocol`).
3. **Transports** — names read from
   `node.components.transportManager.getTransports()` (each
   `[Symbol.toStringTag]`). In solo mode this is exactly
   `WebSockets, circuit-relay-v2` — the explicit assertion that the
   `db-p2p/rn` entrypoint excluded TCP from the browser bundle.
4. **FRET** — `listPeers().length`, `getNetworkSizeEstimate()`,
   `getNetworkChurn()`, `detectPartition()`, last refresh timestamp, my
   Arachnode ring depth / status / capacity (pulled from
   `fret.listPeers()[self].metadata.arachnode`), and the set of known ring
   depths across all known peers.
5. **Storage** — backend class name, `navigator.storage.estimate()` quota
   + usage with percent, `IRawStorage.getApproximateBytesUsed()`, and a
   per-store row count (`metadata`, `revisions`, `pending`, `transactions`,
   `materialized`, `kv`).
6. **Crypto sanity** — six boolean checks for `crypto.subtle`,
   `EventTarget`, `Promise.withResolvers`, `structuredClone`,
   `ReadableStream`, and `globalThis.Buffer`.
7. **Recent errors** — 10-deep ring buffer fed by:
   - The `start()` / `stop()` catch sites in `store.svelte.ts`.
   - `node.addEventListener('connection:close' | 'peer:disconnect', ...)`
     when the event's `detail.error` is set.
   - Global `window.error` and `window.unhandledrejection` events.
   - Failures inside the tick itself (clipboard, storage estimate, raw
     bytes probe).

### Cross-cutting

- **2s tick gated on visibility**: `visibilitychange` listener starts /
  stops the interval. Tick is also idempotent — concurrent calls short-
  circuit via `refreshInFlight`.
- **Copy-to-clipboard**: `Copyable.svelte` uses `navigator.clipboard.writeText`
  and flashes "copied" for 1.2s. Wraps every peer ID and multiaddr in the
  Identity and Connectivity sections.
- **Hash router**: `router.svelte.ts` listens on `hashchange`, exposes a
  reactive `{ path }` $state object, and provides `hrefFor(path)` for the
  nav. Designed so the upcoming `reference-app-web-message-app` ticket can
  reuse it for `/log`.

## Verification

- `yarn workspace @serfab/reference-app-web typecheck` → exit 0.
- `yarn workspace @serfab/reference-app-web build` → exit 0; 1497 modules
  transformed; 1.20 MB bundle / 368 KB gzip. The two dynamic-vs-static
  import warnings inside upstream `@optimystic/db-p2p` and `p2p-fret` are
  pre-existing and called out in the scaffold-review notes.

## Usage / testing notes

Solo-mode acceptance (manual, no remote bootstrap):

1. `yarn workspace @serfab/reference-app-web dev`, open `http://localhost:5173/#/diag`.
2. Identity → "persisted ✓" with a fresh `firstSeenMs` timestamp.
3. Connectivity → status `running`, zero connections, empty listen
   multiaddrs.
4. Transports → list is exactly `WebSockets, circuit-relay-v2`.
5. FRET → 0 known peers, `getNetworkSizeEstimate().estimate === 1`,
   partition `none`.
6. Storage → backend `IndexedDBRawStorage`, quota populated, all object
   stores at 0 except `kv` at 2 (peer-private-key + identity-first-seen).
7. Crypto sanity → six green checks.
8. Hide the tab for ~10s, return; `updated` timestamp advances within 2s.
9. Click any peer-id or multiaddr's `copy` button → clipboard contains it.

Distributed-mode acceptance (manual — requires the `reference-peer-wss-listen`
ticket to land, then the `reference-app-web-message-app` `Network` panel to
dial the bootstrap):

- After Connect, Connectivity → 1+ connection lines with the relay's
  multiaddr; FRET → known peers > 0, network size estimate climbs.

## Things to look for in review

- **Crypto sanity completeness** — the ticket called for "is this browser
  viable" coverage; current six fields match the items the scaffold's
  `polyfills.ts` either shims or asserts the host provides. Confirm there
  isn't an obvious omission (e.g. `crypto.getRandomValues`, `BigInt`, ...).
- **FRET arachnode extraction** — `extractArachnode()` reads
  `peer.metadata.arachnode` and assumes the same shape `ArachnodeInfo`
  publishes. Cross-check against
  `db-p2p/src/storage/arachnode-fret-adapter.ts` if upstream renames keys.
- **Error event coverage** — only `connection:close` and `peer:disconnect`
  are subscribed for libp2p-side errors. If recent libp2p versions surface
  errors through a different event name (`transport:close`, `connection:error`,
  ...), add subscriptions.
- **`identity-first-seen` semantics** — on an upgrade-path device that had
  a key before this ticket landed, "first seen" becomes the upgrade
  timestamp, not the real creation time. The UI does not claim it is the
  key's birthday; revisit only if the diagnostic value misleads.
- **Cross-browser smoke** — Firefox / Safari manual verification still
  carries forward from the scaffold ticket. The diagnostics page itself
  uses only standard APIs (`navigator.storage`, `navigator.clipboard`,
  `IDBPDatabase.count`); list any panels that don't populate.

## Out of scope / deferred

- Mutate buttons (Stop / Restart / Connect) on `/diag` itself — explicitly
  excluded per the ticket; the Network panel from
  `reference-app-web-message-app` will own start/stop/connect.
- Real-time push of FRET / connection changes — the 2s tick is the
  contract for v1; subscriber-driven updates are a follow-up.
- Browser smoke against Firefox / Safari — same gap the scaffold carried
  forward; cannot be validated under the agent harness.
