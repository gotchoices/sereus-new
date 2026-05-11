# @serfab/reference-app-web

Svelte 5 + Vite SPA exercising the Optimystic libp2p stack in a browser. This
is the browser counterpart to `@serfab/reference-app-rn` (which targets phones
via React Native), and the validation surface for "Optimystic actually works
in a browser."

This package is the **scaffold**: it boots a libp2p node in solo mode (no
bootstrap, no listen addresses), persists an Ed25519 identity across reloads
via `@optimystic/db-p2p-storage-web`, and displays the resulting peer ID.

The message app, distributed mode, and diagnostics pages are layered on by
follow-up tickets (`reference-app-web-message-app`,
`reference-app-web-diagnostics`).

## Run

```bash
yarn workspace @serfab/reference-app-web dev      # dev server on :5173
yarn workspace @serfab/reference-app-web build    # static SPA bundle in dist/
yarn workspace @serfab/reference-app-web preview  # serve the built bundle
```

On first page load the app generates a fresh Ed25519 keypair, stores it in
IndexedDB (`sereus-web-reference` database, `kv` object store), and shows the
peer ID. Reload preserves the same peer ID. Delete the IndexedDB database
from DevTools → Application → Storage to rotate the identity.

## How it works

- **Transports**: WebSockets + circuit-relay-v2 only — browsers cannot listen
  for inbound connections.
- **Storage**: `IndexedDBRawStorage` from `@optimystic/db-p2p-storage-web`,
  backed by a single shared IDB database opened with `openOptimysticWebDb()`.
- **Identity**: `loadOrCreateBrowserPeerKey()` reads/writes the Ed25519
  protobuf bytes under `kv` → `peer-private-key`.
- **libp2p factory**: same `@optimystic/db-p2p/rn` entrypoint used by the RN
  reference. The `rn` export intentionally omits Node-only transports.

## Vite config notes

Browsers natively provide `crypto.subtle`, `EventTarget`, `ReadableStream`,
`structuredClone`, `Promise.withResolvers`, `AbortSignal.throwIfAborted`, and
`TextEncoder`/`Decoder`, so the polyfill surface is much smaller than RN.

`vite.config.ts` aliases only the Node built-ins that transitive libp2p deps
reach for — `os`, `net`, `tls` → empty shim; `stream` → `readable-stream`;
`buffer` → npm `buffer`. **`node:crypto` / `crypto` are deliberately not
aliased**: anything reaching for them in a browser bundle is a real bug we
want surfaced.

`src/polyfills.ts` handles the two residual gaps that even modern browsers
don't cover:

- `globalThis.Buffer` — wired to the npm `buffer` package.
- `setTimeout` / `setInterval` return values with no-op `.ref()` / `.unref()`.
  Node-targeting libraries (db-p2p's ClusterMember, libp2p internals) call
  `.unref()` on timer handles; browsers return plain numbers.

If you discover another missing API, add it to `polyfills.ts` with a comment
explaining which package needs it — do not introduce a `crypto` shim.

## Browser support

- **Chromium / Chrome**: verified — peer ID generates, persists across
  reload, console clean (only the routine favicon 404).
- **Firefox**: should work — relies only on standard APIs (WebSocket,
  IndexedDB, WebCrypto, `crypto.subtle`). Smoke-check before relying on it.
- **Safari**: untested in this scaffold. The
  `@optimystic/db-p2p-storage-web` package targets Safari 14+ (the minimum
  with stable IndexedDB v2 + WebCrypto). Smoke-check before relying on it.

If anything fails in Firefox / Safari, capture the console error and file a
fix ticket rather than papering it over with a shim — the same applies as for
`crypto`.

## File layout

```
src/
  App.svelte             # peer-id display, status, restart button
  main.ts                # mount + polyfill bootstrap
  polyfills.ts           # Buffer global + timer .ref/.unref shim
  main.css               # global styles
  lib/
    optimystic.ts        # singleton — startNode / stopNode / getNode
    store.svelte.ts      # Svelte 5 runes wrapper around the singleton
  shims/
    empty.ts             # vite alias target for node:os / node:net / node:tls
```
