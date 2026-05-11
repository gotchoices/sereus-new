description: Ship a browser-targeted ESM bundle of `quereus-plugin-sereus` (and a `./plugin-browser` exports condition) so it can be loaded by Quoomb-web's worker via plugin-loader without an external bundling service.
files:
  - packages/quereus-plugin-sereus/package.json
  - packages/quereus-plugin-sereus/src/plugin.ts
  - packages/quereus-plugin-sereus/src/connect.ts
  - packages/quereus-plugin-sereus/tsconfig.build.json
  - packages/quereus-plugin-sereus/README.md
  - ../quereus/packages/quoomb-web/src/worker/quereus.worker.ts
  - ../quereus/packages/quoomb-web/src/stores/session/plugins.ts
----

## Problem

Quoomb-web loads plugins by dynamic-importing an ESM URL inside its Web Worker (`quoomb-web/src/worker/quereus.worker.ts` → `dynamicLoadModule(url, db, config)`; URL validated in `quoomb-web/src/stores/session/plugins.ts:18`). The currently published artifact, `packages/quereus-plugin-sereus/dist/plugin.js`, is unbundled Node-targeted ESM with bare specifiers (`@optimystic/db-p2p`, `@optimystic/quereus-plugin-optimystic`, `@optimystic/quereus-plugin-crypto`, `debug`, `@libp2p/interface`). The worker has no resolver for bare specifiers, so the plugin will not load there without an external CDN like `esm.sh`.

Beyond resolution, the runtime stack the plugin pulls in via `connect.ts:92` (`createLibp2pNode` from `@optimystic/db-p2p`) is configured for Node — TCP transport, Node `Buffer`/`process` usage in transitive deps, etc. A browser entry point needs to:

- Resolve all imports into a single self-contained ESM file (no bare specifiers).
- Use a libp2p transport set viable in a Worker (WebSockets `/wss`, WebRTC, or circuit-relay).
- Avoid Node-only globals (`process`, `Buffer`, `fs`, `net`, `dgram`).
- Provide a browser-suitable default for `IRawStorage` (IndexedDB or OPFS) so bootstrap-mode strands have somewhere to put rows when no node injection is supplied.

Until this lands, the README's "Plugin Loader (Quoomb)" section is misleading for Quoomb-web users — it works in Node embeddings of the plugin loader, not in the browser worker.

## Scope

- Add a browser-bundled artifact at `packages/quereus-plugin-sereus/dist/plugin-browser.js` (single self-contained ESM file, source map alongside) plus `dist/plugin-browser.d.ts`.
- Add a `./plugin-browser` exports condition in `package.json` pointing at the new file. Keep `./plugin` (Node) unchanged so cadre-core / sereus-health are unaffected.
- Pick and integrate a bundler (`esbuild` is the obvious fit — fast, ESM-out, `--platform=browser`, `--format=esm`, alias map for Node shims). Wire it into the existing `yarn build` script so the browser bundle is produced alongside `tsc`'s declarations.
- Configure `createLibp2pNode` (or a browser-only sibling) to use a transport set the worker can run: WebSockets and WebRTC at minimum, no TCP. This may require a flag on the `db-p2p` side or a thin adapter inside this package; coordinate with `@optimystic/db-p2p` rather than forking its config.
- Default `rawStorageFactory` for the browser path to an IndexedDB-backed `IRawStorage` (or OPFS where available). Keep it overridable through config.
- README: add a "Quoomb-web (browser)" section with a copy-pasteable URL form (CDN and self-hosted), the multiaddr requirements (`/wss`, `/webrtc`), and a worked example with `bootstrap_nodes` that actually work from a browser.

## Expected behavior

- A user pastes `https://<host>/<path>/plugin-browser.js` into Quoomb-web's Plugins panel, sets `strand_id` (and a `/wss` or `/webrtc` `bootstrap_nodes` for networked mode), and the plugin loads with no console errors about missing modules or undefined Node globals.
- `select * from App.<Table>` works against a freshly declared schema, both in bootstrap mode (writes land in IndexedDB and survive a page reload) and in networked mode against a peer reachable over `/wss`.
- The autoload path in `quoomb-web/src/stores/session/plugins.ts:184–204` succeeds with a matching `quoomb.config.json` entry pointing at the browser bundle.
- Node consumers (cadre-core, sereus-health, the existing test suite) continue resolving `@serfab/quereus-plugin-sereus/plugin` to the Node build with no behavior change.

## Out of scope

- E2E coverage of the browser bundle inside Quoomb-web — that's a separate ticket once this artifact exists; consider chaining it onto `quereus-plugin-sereus-bootstrap-e2e` / `quereus-plugin-sereus-networked-e2e` rather than adding a third browser-specific suite blindly.
- Any redesign of `db-p2p`'s transport selection beyond what this plugin needs to opt into.
- A React Native bundle (sereus-health already wires the plugin via cadre-core; no plugin-loader URL flow there).

## Open questions

- Does `@optimystic/db-p2p` already expose a browser-friendly `createLibp2pNode` profile, or do we need to add one upstream first? If the latter, this ticket has a prereq in the optimystic repo and should move to `blocked/` only after that's confirmed missing — otherwise document the chosen profile and proceed.
- Is the worker context cross-origin-isolated in Quoomb-web (needed for some WebRTC/SAB code paths)? If not, OPFS + WebSockets-only is the safe default for the first pass.
- Bundle size budget: the optimystic + libp2p stack is large. Pick a soft cap (e.g. 2 MB gzipped) and decide upfront whether to code-split the networked-mode branch behind a dynamic import so bootstrap-only users pay less.

## References

- `packages/quereus-plugin-sereus/src/plugin.ts`, `src/connect.ts` — entry points to bundle.
- `packages/quereus-plugin-sereus/package.json` — `exports` map and `quereus.settings` block.
- `../quereus/packages/quoomb-web/src/worker/quereus.worker.ts:522` — `loadModule` host site.
- `../quereus/packages/quoomb-web/src/stores/session/plugins.ts:18` (`validatePluginUrl`), `:100–129` (config update path), `:184–204` (config-file autoload).
- `tickets/complete/1-wire-strand-storage-into-bootstrap-transactor.md` — `IRawStorage` wiring the browser bundle must mirror with an IndexedDB/OPFS implementation.
