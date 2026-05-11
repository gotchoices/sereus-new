description: Diagnostics route (`/diag`) layered onto reference-app-web — seven cheap-poll sections covering identity, connectivity, transports, FRET, storage, crypto sanity, and a libp2p error ring buffer
files: packages/reference-app-web/src/App.svelte, packages/reference-app-web/src/Home.svelte, packages/reference-app-web/src/Diagnostics.svelte, packages/reference-app-web/src/lib/diagnostics.svelte.ts, packages/reference-app-web/src/lib/router.svelte.ts, packages/reference-app-web/src/lib/Copyable.svelte, packages/reference-app-web/src/lib/optimystic.ts, packages/reference-app-web/src/lib/store.svelte.ts, packages/reference-app-web/README.md
----

## Summary

A `/diag` hash-route on top of the scaffold's minimal home page, populated by
a 2-second tick that pauses under `document.visibilityState !== 'visible'`.
The tick runs only cheap probes — `node.getConnections()`,
`fret.listPeers()`, `db.count(...)`, `navigator.storage.estimate()`,
`storage.getApproximateBytesUsed()`. No network round-trips.

### Files added

```
packages/reference-app-web/src/
  App.svelte                      # nav header + hash route switch
  Home.svelte                     # status, peer id, restart
  Diagnostics.svelte              # seven-section read-only diagnostics view
  lib/
    diagnostics.svelte.ts         # tick store + error ring buffer + start/stop lifecycle
    router.svelte.ts              # hash router (#/, #/diag, ...) with $state route
    Copyable.svelte               # click-to-copy chip for peer IDs / multiaddrs
```

### Files modified

- `src/lib/optimystic.ts` — tracks an `identity-first-seen` timestamp in the
  `kv` store and exposes `getDb()` / `getStorage()` for the tick.
- `src/lib/store.svelte.ts` — feeds the error ring buffer when `start()` /
  `stop()` catches throw.
- `README.md` — new "Diagnostics (`#/diag`)" section enumerates the seven
  panels and lists four debugging recipes; file layout updated.

### Sections rendered on `/diag`

1. **Identity** — peer ID (full + short, both copyable), persisted badge,
   first-seen timestamp + age duration.
2. **Connectivity** — node `status`, listen multiaddrs, per-connection
   table (peer ID, remote multiaddr, direction, open protocols).
3. **Transports** — names from `transportManager.getTransports()`. Solo
   mode is exactly `WebSockets, circuit-relay-v2`.
4. **FRET** — `listPeers().length`, `getNetworkSizeEstimate()`,
   `getNetworkChurn()`, `detectPartition()`, last refresh timestamp, my
   Arachnode ring depth / status / capacity, and the set of known ring
   depths across all peers.
5. **Storage** — backend class name, `navigator.storage.estimate()`
   quota+usage, `IRawStorage.getApproximateBytesUsed()`, and a per-store
   row count.
6. **Crypto sanity** — seven boolean checks for `crypto.subtle`,
   `crypto.getRandomValues`, `EventTarget`, `Promise.withResolvers`,
   `structuredClone`, `ReadableStream`, and `globalThis.Buffer`.
7. **Recent errors** — 10-deep ring buffer fed by:
   - The `start()` / `stop()` catch sites in `store.svelte.ts`.
   - Per-Connection `close` events (`StreamCloseEvent.error`), attached
     on each `connection:open` so the error detail is actually read from
     where libp2p surfaces it.
   - Global `window.error` and `window.unhandledrejection` events.
   - Failures inside the tick itself (clipboard, storage estimate, raw
     bytes probe).

### Cross-cutting

- **2s tick gated on visibility**: `visibilitychange` listener starts /
  stops the interval. Tick is also idempotent — concurrent calls
  short-circuit via `refreshInFlight`.
- **Copy-to-clipboard**: `Copyable.svelte` uses
  `navigator.clipboard.writeText` and flashes "copied" for 1.2s.
- **Hash router**: `router.svelte.ts` listens on `hashchange`, exposes a
  reactive `{ path }` $state object, and provides `hrefFor(path)` for the
  nav.

## Review notes / changes applied

- **Error capture fix.** The original implementation subscribed to the
  node-level `connection:close` / `peer:disconnect` events and read
  `evt.detail.error`. Per `@libp2p/interface`, those events carry
  `CustomEvent<Connection>` and `CustomEvent<PeerId>` respectively — no
  `.error` field — so the handlers were dead code. Replaced with a
  `connection:open` listener that attaches a one-shot `close` listener to
  each `Connection`; `StreamCloseEvent.error` is the actual error
  carrier. README and `Diagnostics.svelte` updated accordingly.
- **Crypto sanity completeness.** Added `crypto.getRandomValues` to the
  detect list — it sits next to `crypto.subtle` in the libp2p stack's
  expectations and was the obvious omission called out in the original
  review checklist.
- **FRET / arachnode types verified.** Cross-checked against
  `p2p-fret`'s `FretService` and `db-p2p/src/storage/arachnode-fret-adapter.ts`.
  `size_estimate`, `confidence`, `sources`, `ringDepth`, `status`, and
  `capacity.{total,used,available}` all match upstream. No drift.

## Verification

- `yarn workspace @serfab/reference-app-web typecheck` → exit 0.
- `yarn workspace @serfab/reference-app-web build` → exit 0; 1497 modules
  transformed; 1.20 MB bundle / 368 KB gzip. The two
  dynamic-vs-static import warnings inside upstream `@optimystic/db-p2p`
  and `p2p-fret` are pre-existing and carry forward from the scaffold.

This package has no automated test runner configured (no Vitest/Jest).
The validation contract is typecheck + build + the manual smoke recipe
below — same gate the scaffold ticket landed under.

## Usage / smoke test

Solo-mode acceptance (manual, no remote bootstrap):

1. `yarn workspace @serfab/reference-app-web dev`, open
   `http://localhost:5173/#/diag`.
2. Identity → "persisted ✓" with a fresh `firstSeenMs` timestamp.
3. Connectivity → status `running`, zero connections, empty listen
   multiaddrs.
4. Transports → list is exactly `WebSockets, circuit-relay-v2`.
5. FRET → 0 known peers, `getNetworkSizeEstimate().estimate === 1`,
   partition `none`.
6. Storage → backend `IndexedDBRawStorage`, quota populated, all object
   stores at 0 except `kv` at 2 (peer-private-key + identity-first-seen).
7. Crypto sanity → seven green checks.
8. Hide the tab for ~10s, return; `updated` timestamp advances within 2s.
9. Click any peer-id / multiaddr's `copy` button → clipboard contains it.

Distributed-mode acceptance (manual — requires `reference-peer-wss-listen`
and the upcoming `reference-app-web-message-app` Network panel):

- After Connect, Connectivity → 1+ connection lines with the relay's
  multiaddr; FRET → known peers > 0, network size estimate climbs.
- Force a non-graceful close (kill the relay, or `node.hangUp()` from
  devtools) → Recent errors gains a `connection:close` entry with the
  remote peer's short ID and the close reason.

## Out of scope / deferred

- Mutate buttons (Stop / Restart / Connect) on `/diag` — Network panel
  from `reference-app-web-message-app` will own start/stop/connect.
- Real-time push of FRET / connection changes — the 2s tick is the
  contract for v1; subscriber-driven updates are a follow-up.
- Cross-browser smoke against Firefox / Safari — same gap the scaffold
  carried forward; cannot be validated under the agent harness.
- Automated tests — the package has no test runner. If one is added later
  (Vitest), high-value targets are `formatBytes` / `formatDuration` /
  `shortPeerId` (pure) and `pushError`'s ring-buffer eviction.
