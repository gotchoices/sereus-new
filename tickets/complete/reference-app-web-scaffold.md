description: Svelte 5 + Vite browser scaffold for Optimystic — solo-mode libp2p node, IndexedDB-persisted identity, peer ID display
files: packages/reference-app-web/, package.json (root resolutions), ../optimystic/packages/db-p2p-storage-web
----

## What was built

`@serfab/reference-app-web` — Svelte 5 + Vite SPA that boots a libp2p node in
solo mode via `@optimystic/db-p2p/rn`, persists an Ed25519 identity through
`@optimystic/db-p2p-storage-web` (IndexedDB), and renders the peer ID.
Counterpart to `@serfab/reference-app-rn` for browsers, and the eventual host
for the `quereus-plugin-sereus` browser bundle.

### Files added

```
packages/reference-app-web/
  package.json           # workspace entry, vite 6, svelte 5, hoistingLimits: workspaces
  tsconfig.json          # extends @tsconfig/svelte, strict
  svelte.config.js
  vite.config.ts         # node:* aliases (NOT crypto), global: globalThis
  index.html
  README.md              # run instructions + browser support notes
  src/
    main.ts              # polyfill bootstrap + svelte mount
    main.css
    polyfills.ts         # globalThis.Buffer + timer .ref/.unref shim
    App.svelte           # peer ID, status, "Solo" banner, Restart button
    lib/
      optimystic.ts      # startNode / stopNode / getNode singleton
      store.svelte.ts    # Svelte 5 runes wrapper
    shims/
      empty.ts           # vite alias target for os/net/tls
```

### Root changes

- `package.json` resolutions block: added
  `"@optimystic/db-p2p-storage-web": "link:../optimystic/packages/db-p2p-storage-web"`
  parallel to the existing `db-p2p-storage-rn` line.

## Running

```bash
yarn workspace @serfab/reference-app-web dev      # dev server on :5173
yarn workspace @serfab/reference-app-web build    # static SPA bundle in dist/
yarn workspace @serfab/reference-app-web preview  # serve the built bundle
yarn workspace @serfab/reference-app-web typecheck
```

Identity lives in IndexedDB (`sereus-web-reference` database, `kv` object
store, key `peer-private-key`). Delete the database from DevTools to rotate.

## Usage / testing notes

- First-load smoke: peer ID renders, status `running`, no console errors.
- Reload smoke: same peer ID persists.
- Restart button: cycles through `stopped` → `starting` → `running` while
  preserving the peer ID across the cycle.

## Review findings

- **Vite aliases**: `node:crypto`/`crypto` deliberately not aliased — anything
  reaching for crypto in a browser bundle should surface as a real bug.
  Stream both prefixed and unprefixed forms resolve consistently to
  `readable-stream`.
- **Polyfills**: only `Buffer` global + timer `.ref()/.unref()` wrapping. The
  detection probe (`needsWrap`) gates the wrap so re-runs or pre-polyfilled
  envs no-op. `setTimeout` returns a `number` per the HTML spec across
  Chromium / Firefox / Safari, so the wrap engages identically on all three.
- **`@libp2p/crypto` dependency**: kept. The reviewer TODO speculated this
  was "type symmetry only" and could be dropped, but
  `@optimystic/db-p2p-storage-web` declares `@libp2p/crypto` as a
  `peerDependency` — the host package must provide it.
- **`@multiformats/multiaddr` dependency**: currently unused in app code; the
  follow-up `reference-app-web-message-app` ticket will use it for `dial()`,
  matching the RN reference's `multiaddr(addr)` shape. Left in place as
  scaffold posture for the next ticket.
- **Build warnings**: dynamic-vs-static import mismatches inside upstream
  `@optimystic/db-p2p` and `p2p-fret`. Pre-existing, bundling proceeds
  cleanly.
- **Manual Firefox / Safari smoke**: documented as a README gap. Cannot be
  validated under agent (browser availability).

## Verification

- `yarn workspace @serfab/reference-app-web build` → clean (tsc + vite).
  1489 modules transformed; 1.20 MB bundle / 360 KB gzip.
- Chromium smoke (during implement): peer ID generates, persists across
  reload, console clean.

## Critical fix uncovered during implement

First Chromium load surfaced `TypeError: this.expirationInterval.unref is not
a function` inside `ClusterMember`. Fix landed in `src/polyfills.ts` —
browsers return plain numbers from `setInterval` whereas Node returns
`Timeout` objects with `.ref()` / `.unref()`. The polyfill wraps the handle
with a no-op ref/unref carrier and patches the clear functions to unwrap.
This is a deliberate polyfill (Node `Timeout` semantics don't translate to
browsers) rather than a shim hiding a real bug.

## Follow-up tickets (out of scope)

- `reference-app-web-message-app` — Tree+Diary, CadreNode wiring,
  distributed mode (will reintroduce `@multiformats/multiaddr` usage).
- `reference-app-web-diagnostics` — multi-route diagnostics surface.
- Manual Firefox / Safari smoke — README documents this as a gap to chase
  outside the agent harness.
