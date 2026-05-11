priority: 1
description: Review the Svelte 5 + Vite browser scaffold for Optimystic — solo-mode libp2p node, IndexedDB-persisted identity, peer ID display
prereq:
files: packages/reference-app-web/, package.json (root, for db-p2p-storage-web resolution), ../optimystic/packages/db-p2p-storage-web
----

## What landed

A new `@serfab/reference-app-web` workspace package: Svelte 5 + Vite SPA that
boots a libp2p node in solo mode via `@optimystic/db-p2p/rn`, persists an
Ed25519 identity via `@optimystic/db-p2p-storage-web`, and displays the peer
ID. Counterpart to `@serfab/reference-app-rn` for browsers, and the eventual
host for the `quereus-plugin-sereus` browser bundle.

### Files

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

## Verification done

- `yarn install` clean (no peer-dep regressions beyond pre-existing
  `@react-native/gradle-plugin` warning).
- `yarn workspace @serfab/reference-app-web build` → clean production build,
  1.2 MB bundle (gzip 360 KB). Rollup warns about a few dynamic-vs-static
  import mismatches inside `db-p2p` — these are pre-existing upstream and
  bundling proceeds cleanly.
- Live smoke in Chromium (via Playwright MCP): dev server starts, page
  shows peer ID `12D3KooWLPhtEdjFrCY3EnnQWfRdzqbencBHpzTjYp85xtAbRthU`, status
  `running`, zero console errors or warnings, full reload preserves the same
  peer ID.

## Critical correctness fix uncovered during smoke

First Chromium load surfaced `TypeError: this.expirationInterval.unref is not
a function` inside `ClusterMember` constructor. Browsers return plain numbers
from `setInterval`; Node returns `Timeout` objects with `.ref()` / `.unref()`.
`src/polyfills.ts` wraps timer handles with no-op ref/unref methods (mirroring
the RN polyfill's approach) and patches `clear{Timeout,Interval}` to unwrap.

This is a polyfill we deliberately ship rather than a shim that hides a real
bug — `.unref()` semantics don't translate to browsers (the host owns the
event loop), so a no-op is correct. Reviewer: confirm the wrapping logic
correctly forwards primitive coercion and that no library iterates the
properties of timer handles expecting a Node `Timeout` shape.

## What the reviewer should look at

### Interface points

- `lib/optimystic.ts` — singleton API mirrors `reference-app-rn/src/cadre-phone.ts`
  shape (`startNode` / `stopNode` / `getNode`), but is libp2p-only (no
  CadreNode yet — that's the message-app ticket). Check that it's a clean
  base for layering the message app on top.
- `lib/store.svelte.ts` — Svelte 5 runes (`$state`). Check that the
  `NodeStatus` enum covers what the UI needs without overloading.
- `App.svelte` — minimal but production-quality. Confirm status badge colors
  and the Solo banner read sensibly.

### Cross-cutting

- **Vite alias map**: confirm we haven't snuck in a `crypto` shim. The ticket
  is explicit that crypto reaches must surface as bugs.
- **Polyfills**: only `Buffer` + timer wrapping. README documents the
  contract that new gaps must be added explicitly with a comment.
- **README**: browser support section flags Firefox/Safari as needing
  smoke-checks before relying on them. We verified Chromium only.

## Out of scope (handled by follow-up tickets)

- `reference-app-web-message-app` — Tree+Diary, CadreNode wiring, distributed
  mode.
- `reference-app-web-diagnostics` — multi-route diagnostics surface.
- Manual Firefox / Safari smoke-check — README documents this as a gap.

## Reviewer TODO

- [ ] Sanity-check `vite.config.ts` aliases against rollup's resolution
      (specifically that `node:stream` and `stream` both resolve to
      `readable-stream` consistently).
- [ ] Validate the timer polyfill detection branch (`needsWrap`) — in
      Chromium it's `true`; confirm it stays `true` in Firefox / Safari and
      doesn't no-op incorrectly.
- [ ] Confirm `installConfig.hoistingLimits: 'workspaces'` is the right
      choice — `reference-app-rn` uses it for Metro; for Vite the strict
      reason is less obvious but it matches the sibling package's hoisting
      stance.
- [ ] Manual Firefox + Safari smoke-check; record results in the README.
- [ ] Eyeball `package.json` deps — `@libp2p/crypto` is included for type
      symmetry with the storage-web identity helper but isn't directly
      imported by app code. Drop if you find no use after looking.
