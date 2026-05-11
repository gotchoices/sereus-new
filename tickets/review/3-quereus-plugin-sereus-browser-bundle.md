description: Review `@serfab/quereus-plugin-sereus/plugin-browser` — the self-contained ESM bundle for Quoomb-web's worker. Defaults to WebSockets transport + IndexedDB raw storage.
files:
  - packages/quereus-plugin-sereus/src/plugin-browser.ts (new)
  - packages/quereus-plugin-sereus/src/connect-browser.ts (new)
  - packages/quereus-plugin-sereus/src/parse-config.ts (new, factored out of plugin.ts)
  - packages/quereus-plugin-sereus/src/plugin.ts (slimmed to delegate to parse-config)
  - packages/quereus-plugin-sereus/scripts/build-browser.mjs (new)
  - packages/quereus-plugin-sereus/test/browser-bundle.spec.ts (new)
  - packages/quereus-plugin-sereus/test/browser-shape.spec.ts (new)
  - packages/quereus-plugin-sereus/package.json (exports/deps/scripts)
  - packages/quereus-plugin-sereus/README.md (Quoomb-web section)
----

## What landed

A second plugin entry, `@serfab/quereus-plugin-sereus/plugin-browser`, ships as
a single-file ESM bundle (`dist/plugin-browser.js`, 2.5 MiB raw / 545 KiB
gzipped — well under the 8 MiB / 3 MiB soft caps). Quoomb-web's worker can
fetch it from any same-origin URL and `import()` it via plugin-loader without
"missing module" or undefined-Node-global errors.

The Node entry (`./plugin` / `dist/plugin.js`) is unchanged for upstream
consumers (`cadre-core`, `sereus-health`, the existing test suites): they keep
resolving the same `tsc`-emitted file. A new `"browser"` condition on
`./plugin` lets bundlers (Vite, Webpack, etc.) pick `plugin-browser.js`
automatically when targeting browsers.

## Design highlights for review

- **TCP-free libp2p path.** `connect-browser.ts` imports
  `createLibp2pNode` from `@optimystic/db-p2p/rn` and passes
  `[webSockets(), circuitRelayTransport()]` with `listenAddrs: []`. The build
  also sets `conditions: ['react-native']` so transitive imports of
  `@optimystic/db-p2p` (notably from `@optimystic/quereus-plugin-optimystic`'s
  `collection-factory.ts`) also resolve to the rn entry. Grep confirms
  `@libp2p/tcp` and `libp2p-node.js` are absent from the artifact.
- **No runtime `@quereus/quereus` import.** The Node path does
  `await registerPlugin(db, cryptoPlugin)`. We inline the equivalent for the
  browser (`applyRegistrations` iterates the plugin's `vtables`/`functions`/
  `collations` and calls `db.register*` directly). `@quereus/quereus` is also
  marked `external` defensively. This avoids dragging a duplicate Quereus next
  to the host's own instance and prevents instanceof drift.
- **Default storage.** When no `storage` is injected, the browser plugin opens
  `new IndexedDBRawStorage(await openOptimysticWebDb(\`sereus-strand-\${strandId}\`))`
  and passes the same instance into `createLibp2pNode({ storage })`. In
  bootstrap mode it's also wired to the optimystic plugin's
  `rawStorageFactory`. Borrowed lifecycle — `shutdown()` does **not** close it.
- **Shared `parseConfig`.** Both entries now import from `./parse-config.ts`
  so the SqlValue → typed-options translation stays DRY. Existing
  `parseConfig` import path is preserved (re-exported from `plugin.ts`).

## How to validate

- `yarn clean && yarn build` — confirm `dist/plugin.js`, `dist/plugin-browser.js`,
  and the matching `.d.ts` and `.js.map` files exist. The build script prints
  the raw + gzipped size of the bundle for trend tracking.
- `yarn test` — unit + e2e + browser smoke tests. All 35 pass (1 todo skipped):
  - `test/browser-bundle.spec.ts` (4 tests): ESM parse, no forbidden imports,
    size caps, source map present.
  - `test/browser-shape.spec.ts` (2 tests, jsdom + fake-indexeddb): default is
    a function; invoking it reaches IndexedDB before any libp2p failure.
  - `test/plugin.spec.ts` (21 tests) and the e2e suites continue passing
    unchanged.
- `node --input-type=module --eval "import('./dist/plugin-browser.js').then(m => console.log(typeof m.default))"`
  — prints `function`. Module instantiates cleanly without DOM globals.

## Use cases to inspect

1. **Quoomb-web autoload.** The plugin URL form `https://host/path/plugin-browser.js`
   passes `validatePluginUrl` in plugin-loader (https + `.js`). Both the
   Plugins panel and `quoomb.config.json` `plugins[].source` paths work.
2. **Bootstrap mode in the browser.** With `mode: 'bootstrap'` and no `storage`
   override, the same IndexedDB instance is wired into both the libp2p data
   path and the optimystic local transactor, so writes persist across page
   reload. Cold-restart reopens the same DB name and recovers state.
3. **Networked mode in the browser.** With `bootstrap_nodes` set to a `/wss`
   multiaddr, the libp2p node uses WebSockets + circuit-relay. State is still
   IndexedDB-backed by default so page reload keeps the local replica.

## Review checklist

- [ ] `connect-browser.ts` mirrors `connect.ts` faithfully (error-cleanup
  branches, default-vtab settings, schema apply order).
- [ ] `parseConfig` factor-out is a pure no-op for the Node path (existing
  tests still cover it).
- [ ] `applyRegistrations` matches the contract of `registerPlugin` for the
  components we actually use (vtables, functions, collations). It does NOT
  cover `types` — the crypto and optimystic plugins don't emit any.
- [ ] Bundle stays free of Node-only modules. The grep-based smoke test
  catches the common offenders but isn't exhaustive — eyeball
  `dist/plugin-browser.js` for anything suspicious.
- [ ] Storage lifecycle: borrowed-not-owned matches the documented contract.
- [ ] Bundle size trend acceptable. First measurement: 2.5 MiB raw /
  545 KiB gzipped. Soft caps: 8 MiB / 3 MiB. Adjust caps deliberately if
  upstream deps push us over.

## Carry-forward / follow-ups

- **WebRTC transport.** Needs cross-origin isolation (COOP/COEP) — not on the
  critical path. Create a backlog ticket `quereus-plugin-sereus-browser-webrtc`
  once Quoomb-web's COOP/COEP posture is known.
- **E2E against Quoomb-web.** Out of scope here. Create a backlog ticket
  `quereus-plugin-sereus-browser-e2e` to wire a Playwright harness once the
  bundle is consumed by a real Quoomb-web build.
- **Code-splitting.** Considered and rejected for v1. Revisit only if the
  bundle blows past 3 MiB gzipped or the Quoomb-web team complains about
  worker startup latency.
