description: Ship `@serfab/quereus-plugin-sereus/plugin-browser` — a self-contained ESM bundle (esbuild) so Quoomb-web's worker can load the plugin via plugin-loader without a CDN. Defaults to WebSockets transport and IndexedDB raw storage.
files:
  - packages/quereus-plugin-sereus/package.json
  - packages/quereus-plugin-sereus/src/plugin-browser.ts (new)
  - packages/quereus-plugin-sereus/src/connect-browser.ts (new)
  - packages/quereus-plugin-sereus/src/connect.ts
  - packages/quereus-plugin-sereus/src/types.ts
  - packages/quereus-plugin-sereus/scripts/build-browser.mjs (new)
  - packages/quereus-plugin-sereus/tsconfig.build.json
  - packages/quereus-plugin-sereus/README.md
----

## Goal

A user can paste `https://<host>/<path>/plugin-browser.js` into Quoomb-web's Plugins panel (or list it under `plugins[].source` in `quoomb.config.json`), supply `strand_id`, optionally a `/wss` `bootstrap_nodes`, and the worker's `dynamicLoadModule` dynamic-imports it without "missing module" / undefined-Node-global errors. Node consumers (`cadre-core`, `sereus-health`, the existing test suites) keep resolving `@serfab/quereus-plugin-sereus/plugin` to the unchanged `tsc`-emitted file.

## Design decisions (from research)

The plan ticket asked three open questions. All answer themselves from the upstream surface:

1. **Does `@optimystic/db-p2p` expose a browser profile?** Yes — `createLibp2pNode` in `../optimystic/packages/db-p2p/src/libp2p-node.ts:14-36` already accepts `disableTcp`, an explicit `transports` array, and explicit `listenAddrs`. There is also a TCP-free `./rn` entry (`libp2p-node-rn.ts:17-30`, exposed as `@optimystic/db-p2p/rn` via the package's `react-native` export condition) that errors if you don't pass `transports`. **No upstream change required.** We bundle from `@optimystic/db-p2p/rn`, which keeps `@libp2p/tcp` out by construction rather than relying on tree-shaking past a top-of-module side-effect import.

2. **Cross-origin isolation?** Don't assume it. v1 ships WebSockets + circuit-relay only — both work in any Worker context. WebRTC needs COOP/COEP and isn't on the critical path; track it as a follow-up.

3. **Bundle size cap?** Soft cap 3 MB gzipped (the libp2p + optimystic surface is large; we measure once and document the actual number in the README). No code-splitting between bootstrap and networked mode in v1 — the cost of splitting (extra round trip for the libp2p import, async barrier in `connectToStrand`) outweighs the saving when the worker fetches the bundle once per session.

## Architecture

### Two-file approach in `src/`

- `src/connect-browser.ts` — browser-specific port of `connect.ts`. Differs in three ways:
  - Imports `createLibp2pNode` statically from `@optimystic/db-p2p/rn` (not the main entry; this avoids pulling in TCP).
  - When no `storage` is injected, constructs `new IndexedDBRawStorage(await openOptimysticWebDb(\`sereus-strand-\${strandId}\`))` from `@optimystic/db-p2p-storage-web` and treats it as owned-and-borrowed the same way the Node path treats a caller-supplied storage (not closed on `shutdown()`).
  - Constructs the libp2p node with an explicit transport set: `[webSockets(), circuitRelayTransport()]` and `listenAddrs: []` (browsers don't listen). The `port`, `wsPort`, `disableTcp` options are not applicable.
  - Does NOT import from `@quereus/quereus` at runtime. The one runtime use in `connect.ts:67` (`await registerPlugin(db, cryptoPlugin)`) is inlined: call `cryptoPlugin(db, {})` directly and iterate the returned `vtables`/`functions`/`collations` onto `db.registerModule` / `db.registerFunction` / `db.registerCollation`. Types are imported via `import type` (erased at compile, no runtime dep). This avoids dragging a duplicate Quereus into the bundle and prevents instanceof drift versus the worker's own Quereus instance.
- `src/plugin-browser.ts` — thin shim mirroring `plugin.ts`. Same `parseConfig` logic (factored out and shared with `plugin.ts`), default export `register(db, config)` that calls `connectToStrandBrowser` instead of `connectToStrand`.

### Bundler

`esbuild` (already an industry-standard, fast, zero-config-for-ESM choice; no monorepo precedent to deviate from):

- `packages/quereus-plugin-sereus/scripts/build-browser.mjs`:
  - `import { build } from 'esbuild'`.
  - `entryPoints: ['src/plugin-browser.ts']`, `outfile: 'dist/plugin-browser.js'`.
  - `bundle: true`, `format: 'esm'`, `platform: 'browser'`, `target: 'es2022'`, `sourcemap: true`, `minify: false` (debuggability over size; revisit if we exceed 3 MB gzipped).
  - `external: ['@quereus/quereus']` — see Architecture note above. The worker will not see this import because we removed the runtime reference; `external` is a defensive belt-and-braces in case a transitive types-only edge bleeds through.
  - `define: { 'process.env.NODE_ENV': '"production"' }` to shake out dev-only branches in transitive deps.
  - Banner with package name + version (read from `package.json`) for traceability when debugging in a browser.

The script is invoked from `yarn build`:

```json
"build": "tsc -p tsconfig.build.json && node scripts/build-browser.mjs"
```

`tsc` continues to emit `dist/plugin.js` (Node, unbundled) plus `dist/plugin-browser.d.ts` from the new source file. The esbuild step overwrites only `dist/plugin-browser.js` (and `.js.map`); declarations come from `tsc`.

### `package.json` exports

Add a `./plugin-browser` export and a `"browser"` condition on `./plugin` so bundlers that respect the condition pick the same artifact automatically:

```json
"./plugin": {
  "types": "./dist/plugin.d.ts",
  "browser": "./dist/plugin-browser.js",
  "import": "./dist/plugin.js"
},
"./plugin-browser": {
  "types": "./dist/plugin-browser.d.ts",
  "import": "./dist/plugin-browser.js"
}
```

Dependency additions:

- `@optimystic/db-p2p-storage-web@^0.13.0` (runtime — the bundle inlines it; also keeps the type import resolvable for editors).
- `@libp2p/websockets@^9` (runtime — needed by `connect-browser.ts`).
- `@libp2p/circuit-relay-v2@^4` (runtime — needed by `connect-browser.ts`).
- `esbuild@^0.24` as devDep.

(Exact versions: pin to whatever the optimystic workspace already uses; check `optimystic/packages/db-p2p/package.json` for the libp2p versions in play.)

### Worker side (Quoomb-web) — confirmed, no change needed

`dynamicLoadModule` (in `../quereus/packages/plugin-loader/src/plugin-loader.ts:83-109`) does a native `import(url)`. It calls `mod.default(db, config)` and returns whatever the plugin returns. The URL validator allows `https://` and `file://` with `.js`/`.mjs`. Same-origin paths like `https://app.example/plugins/plugin-browser.js` pass. The config-file autoload at `../quereus/packages/quoomb-web/src/stores/session/plugins.ts:184-204` reads `plugins[].source` as a URL; the same form works there.

### Storage lifecycle

- If the caller passes `storage` via plugin config (impossible through the SqlValue config map — only programmatic API), borrow-and-don't-close, same as Node.
- If no `storage` is passed AND we constructed the IndexedDB handle ourselves, still don't close on `shutdown()`. IndexedDB handles are cheap and the worker may want to reopen the strand later in the same session; closing the handle inside the plugin would race against any pending writes the optimystic local transactor still has in flight. Document this in the README.

### Bootstrap mode in the browser

`mode: 'bootstrap'` works identically to Node — pass `storage` (or let the default IndexedDB one be constructed), and the optimystic plugin's `rawStorageFactory` is wired to the same instance. The optimystic plugin already handles `rawStorageFactory: () => storage` (`connect.ts:80-81`), so writes go to IndexedDB without peer round trips. Page reload reopens the same DB name and recovers state.

## Out of scope (carry forward as follow-ups)

- WebRTC transport — needs cross-origin isolation; create a backlog ticket `quereus-plugin-sereus-browser-webrtc` once we know Quoomb-web's COOP/COEP posture.
- Code-splitting networked-mode behind a dynamic import.
- E2E against Quoomb-web — split into `quereus-plugin-sereus-browser-e2e` backlog ticket once this artifact exists. Don't add it to this ticket; the testing matrix here is "the bundle dynamically imports cleanly in a worker, default export is a function, no Node globals at module top".

## Tests / validation

We can't run a browser test in CI from this package alone without standing up a worker harness. Three lightweight checks here:

- A new unit spec `test/browser-bundle.spec.ts` that:
  - Reads `dist/plugin-browser.js` after `yarn build`.
  - Asserts the file does not contain literal references to `require(`, `process.cwd`, `Buffer.from(` introduced from outside `@noble`/safe transitive deps, or any unresolved bare specifier (i.e., grep for known offenders: `@libp2p/tcp`, `node:fs`, `node:net`, `node:dgram`, `node:os`, `node:child_process`). This is a smoke test — not a guarantee — but it catches the obvious regressions.
  - Asserts the file parses as ESM (use `acorn` or just `new AsyncFunction` with a stub `import` — simpler: spawn `node --input-type=module --check` and feed it stdin; expected to succeed since browser ESM is a strict subset of Node ESM in parse terms, even though it would fail at runtime in Node without DOM/IndexedDB globals).
  - Reports the bundle size and gzipped size (`zlib.gzipSync`). Fail the test if uncompressed > 8 MB or gzipped > 3 MB — these are the soft caps; tune after first build.

- A second spec `test/browser-shape.spec.ts` that imports `dist/plugin-browser.js` in a happy-dom or `fake-indexeddb` jsdom environment (vitest's `environment: 'jsdom'` works), asserts the default export is a function, and asserts calling it with a stub `Database` (no real network) reaches the IndexedDB open call before failing on the libp2p create. The point is to prove module instantiation succeeds — not to exercise networking. Use `fake-indexeddb` (already in `db-p2p-storage-web`'s devDeps) for the global.

- The Node test suite continues running against `src/plugin.ts` / `src/connect.ts` unmodified; it must keep passing.

## README

Append a "Quoomb-web (browser)" section after the existing "Plugin Loader (Quoomb)" section:

- Note that there are two artifacts: `plugin.js` (Node) and `plugin-browser.js` (Worker / browser ESM).
- Sample URL form: `https://your-host/path/plugin-browser.js`.
- Bootstrap multiaddr requirement: `/wss` (or relay-fronted) — TCP and plain `/ws` over HTTP from an HTTPS page won't dial.
- Worked `quoomb.config.json` snippet:

  ```json
  {
    "plugins": [
      {
        "source": "https://your-host/path/plugin-browser.js",
        "config": {
          "strand_id": "abc-...",
          "bootstrap_nodes": "/dns4/relay.example/tcp/443/wss/p2p/Qm..."
        }
      }
    ],
    "autoload": true
  }
  ```

- Storage note: the browser bundle defaults to IndexedDB keyed by `sereus-strand-<strandId>`. Survives page reload. The handle is not closed on `shutdown()` (lifecycle is the page/worker, not the plugin).
- Limitations callout: WebSockets-only in v1; WebRTC is a follow-up. Bootstrap nodes must be reachable from a browser (i.e. `/wss`, not raw `/tcp`).

## References

- `../optimystic/packages/db-p2p/src/libp2p-node.ts:14-36` — transport knobs.
- `../optimystic/packages/db-p2p/src/libp2p-node-rn.ts:17-30` — TCP-free entry.
- `../optimystic/packages/db-p2p-storage-web/src/indexeddb-storage.ts:16`, `src/db.ts:60` — `IndexedDBRawStorage`, `openOptimysticWebDb`.
- `../quereus/packages/plugin-loader/src/plugin-loader.ts:83-109` — `dynamicLoadModule` contract.
- `../quereus/packages/quoomb-web/src/stores/session/plugins.ts:18,184-204` — URL validation + autoload.
- `tickets/complete/1-wire-strand-storage-into-bootstrap-transactor.md` — the storage-wiring shape we mirror.

## TODO

Phase 1 — bundle plumbing

- Add `scripts/build-browser.mjs` using `esbuild` programmatic API. Inputs: `src/plugin-browser.ts`. Outputs: `dist/plugin-browser.js` + `.js.map`. Externalize `@quereus/quereus`. Browser target. Report uncompressed and gzipped size on stdout.
- Update `package.json`: add `./plugin-browser` export, add `browser` condition on `./plugin`, add the three runtime deps (`@optimystic/db-p2p-storage-web`, `@libp2p/websockets`, `@libp2p/circuit-relay-v2`), add `esbuild` devDep. Wire `scripts.build` to `tsc -p tsconfig.build.json && node scripts/build-browser.mjs`.
- Confirm `tsconfig.build.json` emits `dist/plugin-browser.d.ts` (it will because `src` is the rootDir and the new files live under it).

Phase 2 — code

- Factor `parseConfig` out of `src/plugin.ts` into `src/parse-config.ts` so both Node and browser entries share it. Update `plugin.ts` to import from there. No behavior change.
- Add `src/connect-browser.ts`. It must:
  - Statically import `createLibp2pNode` from `@optimystic/db-p2p/rn`.
  - Statically import `webSockets` from `@libp2p/websockets` and `circuitRelayTransport` from `@libp2p/circuit-relay-v2`.
  - Statically import `IndexedDBRawStorage`, `openOptimysticWebDb` from `@optimystic/db-p2p-storage-web`.
  - Statically import `cryptoPlugin` and `optimysticPlugin` (same as `connect.ts` does today).
  - Import `Database`, `SqlValue` from `@quereus/quereus` as **types only** (`import type`). Do NOT import `registerPlugin`.
  - Inline the equivalent of `registerPlugin(db, cryptoPlugin)`: call `await cryptoPlugin(db, {})`, then `for` each `vtables` / `functions` / `collations` entry, call `db.registerModule(...)` / `db.registerFunction(...)` / `db.registerCollation(...)` (signatures already used in `connect.ts:91-96`).
  - Build the libp2p node via `createLibp2pNode({ transports: [webSockets(), circuitRelayTransport()], listenAddrs: [], bootstrapNodes, networkName, fretProfile, ...(storage && { storage }) })`.
  - When `storage` is absent and we need one (bootstrap mode OR libp2p storage default), open one via `openOptimysticWebDb(\`sereus-strand-\${strandId}\`)` wrapped in `new IndexedDBRawStorage(handle)`. Use the same instance for the libp2p `storage` option and (in bootstrap mode) the optimystic plugin's `rawStorageFactory`.
  - Mirror the rest of `connect.ts:73-184` (defaultVtab, schema apply, shutdown handler). Resource-cleanup branches stay identical.
- Add `src/plugin-browser.ts`. Default export `register(db, config)` that calls `parseConfig(config)` then `connectToStrandBrowser(db, options)`. Mirror `plugin.ts` exactly otherwise.

Phase 3 — tests + docs

- Add `test/browser-bundle.spec.ts`. Run `yarn build` once in a `beforeAll` (or assume it's already built via a vitest `globalSetup`), then:
  - Grep the artifact for forbidden tokens: `node:fs`, `node:net`, `node:dgram`, `node:os`, `node:child_process`, `from "@libp2p/tcp"`.
  - Parse it with `acorn` (already a transitive dep) in module mode to confirm well-formed ESM.
  - Compute `fs.readFileSync(path).length` and `zlib.gzipSync(buf).length`; fail if over caps (uncompressed 8 MB / gzipped 3 MB). Log both.
- Add `test/browser-shape.spec.ts` running under `// @vitest-environment jsdom`. Install `fake-indexeddb/auto` at top. Import the bundle dynamically. Assert `typeof mod.default === 'function'`. Construct a stub Database with the minimal shape (`registerModule`, `registerFunction`, `registerCollation`, `setDefaultVtabName`, `setDefaultVtabArgs`, `exec`) recording calls — invoke with `{ strand_id: 'test' }` and assert the IndexedDB open at least happens; ignore the eventual libp2p failure (catch and inspect, don't fail on it).
- Update `README.md` with the "Quoomb-web (browser)" section described above. Include the actual gzipped size measured during Phase 1 build.
- Don't add the bundle to `.gitignore` exclusions in a way that breaks publishing; verify `files` in `package.json` already covers `dist/**` (it does).

Phase 4 — validation

- `yarn clean && yarn build` — confirm both `dist/plugin.js` and `dist/plugin-browser.js` exist, the latter has a sibling `.map`.
- `yarn test` — both new specs pass, all existing specs pass.
- `yarn test:e2e` — Node e2e suite still green (browser bundle never imported here).
- Manually `node --input-type=module --eval "import('./dist/plugin-browser.js').then(m => console.log(typeof m.default))"` — should print `function` (and probably error on the libp2p side since Node lacks IndexedDB; that's fine — we're just confirming module instantiation).
