priority: 2
description: Diagnostics route in reference-app-web surfacing libp2p, FRET, storage, and identity state — the evidence surface for browser-support validation
prereq: reference-app-web-scaffold
files: packages/reference-app-web/src, ../optimystic/packages/db-p2p/src/libp2p-key-network.ts, ../optimystic/packages/db-p2p/src/network/network-manager-service.ts
----

The reference web app's primary value is *evidence* that the stack works in a browser. The diagnostics page collects every signal a developer would inspect when something goes wrong, and proves the happy path when it doesn't.

Single route `/diag`. Polled refresh every 2 seconds while the route is visible (`document.visibilityState === 'visible'`).

### Sections

- **Identity** — peer ID (full + short prefix), "persisted ✓" badge, age of stored key.
- **Connectivity** — node `status` (running / idle / error), listen multiaddrs, connection list (peer ID, remote multiaddr, direction, protocols opened).
- **Transports** — list of registered transport names. Confirms `db-p2p/rn` correctly excluded TCP — should show `webSockets, circuit-relay-v2`.
- **FRET** — known peer count, network size estimate, last refresh tick, ring depth / Arachnode info if exposed (read from `(node as any).services?.fret` and the storage monitor — same surfaces `reference-peer` reads).
- **Storage** — backend (`IndexedDBRawStorage`), `navigator.storage.estimate()` quota and usage, IndexedDB store object counts (one cheap `count()` per store), approximate bytes used per `IRawStorage.getApproximateBytesUsed()`.
- **Crypto sanity** — boolean grid: `crypto.subtle` present, `EventTarget` present, `Promise.withResolvers` present, `structuredClone` present, `ReadableStream` present, `Buffer` shim resolved. Quick "is this browser viable" check.
- **Recent errors** — last 10 errors caught from libp2p events (subscribe to `node.addEventListener('connection:error', ...)` and similar; ring-buffer in app state).

### Constraints
- Read-only — no mutate buttons. (Stop / restart belongs to the Network panel from the message-app ticket.)
- Cheap polling — never call methods that round-trip the network from the 2s tick. Anything network-going belongs on a manual refresh button.
- All values rendered as human-readable strings; copy-to-clipboard on multiaddrs and peer IDs.

### Acceptance
- Solo mode: Identity + Storage + Crypto sanity all populate; Connectivity shows zero connections; Transports lists `webSockets, circuit-relay-v2` and nothing else.
- After connecting to a local `optimystic-peer --ws-port`: Connectivity shows the relay connection within seconds; FRET section starts populating.
- Page is responsive even with the 2s tick running.
- Cross-browser smoke (Chrome, Firefox, Safari) — note any sections that don't populate.

## TODO
- [ ] `/diag` route with the seven sections above
- [ ] Reactive 2s tick that pauses when route hidden (`document.visibilityState`)
- [ ] Cheap probes only — no network round-trips on tick
- [ ] Error-event subscription with ring buffer
- [ ] Copy-to-clipboard on multiaddrs and peer IDs
- [ ] Cross-browser smoke (Chrome, Firefox, Safari) — note any gaps
- [ ] README: brief description of how to use diagnostics to debug
