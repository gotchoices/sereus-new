description: `@serfab/quereus-plugin-sereus` ships a second entry, `./plugin-browser`, as a self-contained ESM bundle for Quoomb-web's worker. WebSockets + circuit-relay transports, IndexedDB raw storage by default, no Node-only imports, no duplicate `@quereus/quereus`.
files:
  - packages/quereus-plugin-sereus/src/plugin-browser.ts
  - packages/quereus-plugin-sereus/src/connect-browser.ts
  - packages/quereus-plugin-sereus/src/parse-config.ts
  - packages/quereus-plugin-sereus/src/plugin.ts
  - packages/quereus-plugin-sereus/scripts/build-browser.mjs
  - packages/quereus-plugin-sereus/test/browser-bundle.spec.ts
  - packages/quereus-plugin-sereus/test/browser-shape.spec.ts
  - packages/quereus-plugin-sereus/package.json
  - packages/quereus-plugin-sereus/README.md
----

## What shipped

Two plugin entries from one package:

- **`./plugin`** (`dist/plugin.js`, emitted by `tsc`) — unchanged Node entry.
  TCP + WebSockets, in-memory or FS-backed storage by default. Used by
  `cadre-core`, `sereus-health`, and the existing test suites.
- **`./plugin-browser`** (`dist/plugin-browser.js`, esbuild bundle) — single
  ESM artifact. Imports `@optimystic/db-p2p/rn` (TCP-free) statically with
  explicit `webSockets() + circuitRelayTransport()` and `listenAddrs: []`.
  Defaults storage to `IndexedDBRawStorage` keyed by `sereus-strand-<strandId>`.
  Inlines `applyRegistrations` (vtables/functions/collations) so the bundle
  doesn't pull a duplicate `@quereus/quereus` next to the host's instance —
  the spec is marked esbuild-external so transitive imports stay as bare
  specifiers the host resolves.

Both entries share `parseConfig` (factored out to `src/parse-config.ts`,
re-exported from each entry so the public path is preserved). A `"browser"`
condition on `./plugin` lets Vite/Webpack auto-pick `plugin-browser.js` for
browser targets.

## Final measurements

- `dist/plugin-browser.js` — 2529.0 KiB raw / 543.6 KiB gzipped. Soft caps
  8 MiB / 3 MiB.
- Build: `tsc -p tsconfig.build.json && node scripts/build-browser.mjs` — the
  esbuild step overwrites the `tsc`-emitted `.js`/`.js.map` for the browser
  entry only, and the `.d.ts` from `tsc` stays.

## Test results

`yarn clean && yarn build && yarn test` — 5 files, 35 tests passing, 1 todo
skipped:

- `test/browser-bundle.spec.ts` (4) — ESM parse, forbidden-import grep
  (`@libp2p/tcp`, `node:fs|net|dgram|os|child_process|dns|tls|cluster`), soft
  size caps, source map present.
- `test/browser-shape.spec.ts` (2, jsdom + fake-indexeddb) — default export is
  a function; invoking it registers crypto + optimystic and reaches
  `indexedDB.open('sereus-strand-shape-test')` before failing on the libp2p
  side (expected — jsdom has no WebSockets transport).
- `test/plugin.spec.ts` (21) — parseConfig and `connectToStrand` regressions.
- `test/e2e/bootstrap.e2e.spec.ts` (4) — solo-node bootstrap + cold-restart
  persistence.
- `test/e2e/networked.e2e.spec.ts` (5, 1 skipped) — two in-process peers over
  real libp2p.

## Validation notes

- **Bundle hygiene.** Grepped final artifact: no `@libp2p/tcp`, no
  `libp2p-node.js`, no `node:*` imports, no bare `fs`/`net`/`tls`/`dgram`/
  `child_process`/`os`/`dns`/`cluster` imports, no `require(`, no
  `__filename`/`__dirname`. `@quereus/quereus` remains as two bare-spec
  imports (intentional — host resolves to its own instance).
- **applyRegistrations.** Covers `vtables`, `functions`, `collations` — the
  three the consumed plugins actually emit. Verified neither
  `@optimystic/quereus-plugin-crypto` nor `@optimystic/quereus-plugin-optimystic`
  returns a `types` array. The omission matches the documented contract; if
  a future plugin starts emitting types this helper would silently drop them.
- **Storage lifecycle.** Borrowed-not-owned matches docs. `shutdown()` stops
  the collection factory and (if created here) the libp2p node only — never
  the IndexedDB handle. The page/worker owns the storage lifetime.
- **`connect-browser.ts` parity with `connect.ts`.** Same option
  destructuring, same `mode`→transactor resolution, same error-cleanup
  branches, same default-vtab settings, same schema apply order. Three
  intentional deltas: TCP-free libp2p entry, IndexedDB storage default,
  inline registration via `applyRegistrations`.
- **`parseConfig` factor-out.** Pure refactor — same 11 parseConfig tests in
  `test/plugin.spec.ts` continue to pass against the re-exported function.

## Usage

Quoomb-web autoload (Plugins panel or `quoomb.config.json`):

```json
{
  "plugins": [
    {
      "source": "https://your-host/path/plugin-browser.js",
      "config": {
        "strand_id": "<uuid>",
        "bootstrap_nodes": "/dns4/relay.example/tcp/443/wss/p2p/Qm..."
      }
    }
  ],
  "autoload": true
}
```

The worker's `dynamicLoadModule(url)` does a native `import(url)`. Serve with
`Content-Type: text/javascript` (or `application/javascript`) and CORS
appropriate for the page origin. WebSockets multiaddrs must be `wss://`
(or relay-fronted) from a TLS page.

In-process programmatic use is unchanged for Node consumers:

```ts
import { connectToStrand } from '@serfab/quereus-plugin-sereus';
const strand = await connectToStrand(db, { strandId, ... });
```

## Follow-ups (out of scope)

- `quereus-plugin-sereus-browser-webrtc` — WebRTC transport once Quoomb-web's
  COOP/COEP posture is known.
- `quereus-plugin-sereus-browser-e2e` — Playwright harness wired against a
  real Quoomb-web build that consumes the bundle.
- Code-splitting — rejected for v1. Revisit only if the bundle goes past
  ~3 MiB gzipped or worker startup latency becomes a complaint.
