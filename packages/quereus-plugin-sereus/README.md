# @serfab/quereus-plugin-sereus

A [Quereus](https://github.com/nicktobey/quereus) plugin that connects to a [Sereus](../../docs/architecture.md) strand for SQL access. Composes the [@optimystic/quereus-plugin-crypto](https://github.com/nicktobey/optimystic/tree/main/packages/quereus-plugin-crypto) and [@optimystic/quereus-plugin-optimystic](https://github.com/nicktobey/optimystic/tree/main/packages/quereus-plugin-optimystic) plugins, manages libp2p networking, and optionally applies a sApp schema.

## Features

- **Strand connection**: Connect a Quereus database to a Sereus strand with a single call
- **Plugin composition**: Automatically registers crypto and optimystic plugins
- **Node management**: Creates a libp2p node or accepts an injected one (e.g. from a CadreNode)
- **Schema application**: Wraps DDL in `declare schema App { ... } apply schema App;`
- **Two entry points**: Plugin-loader compatible default export and a programmatic `connectToStrand()` API

## Installation

```bash
npm install @serfab/quereus-plugin-sereus
```

## Quick Start

### Programmatic API

```typescript
import { Database } from '@quereus/quereus';
import { connectToStrand } from '@serfab/quereus-plugin-sereus';

const db = new Database();
const strand = await connectToStrand(db, {
  strandId: '550e8400-e29b-41d4-a716-446655440000',
  schema: 'table Message (Id integer primary key, Content text not null)',
  bootstrapNodes: ['/ip4/1.2.3.4/tcp/9100/p2p/QmPeerId'],
});

// Query the strand
for await (const row of db.eval('select * from App.Message')) {
  console.log(row);
}

// Clean up
await strand.shutdown();
```

### Plugin Loader (Quoomb)

The `./plugin` export is compatible with Quereus plugin-loader and Quoomb:

```typescript
import { Database, registerPlugin } from '@quereus/quereus';
import sereusPlugin from '@serfab/quereus-plugin-sereus/plugin';

const db = new Database();
const result = await registerPlugin(db, sereusPlugin, {
  strand_id: '550e8400-e29b-41d4-a716-446655440000',
  schema: 'table Message (Id integer primary key, Content text not null)',
  bootstrap_nodes: '/ip4/1.2.3.4/tcp/9100/p2p/QmPeerId',
});

// ... use db ...
await result.shutdown();
```

### Quoomb-web (browser/worker)

The package ships two plugin artifacts:

- `./dist/plugin.js` — Node entry, emitted by `tsc`. Uses TCP + WebSockets and
  in-memory or FS-backed storage by default.
- `./dist/plugin-browser.js` — single-file ESM bundle (built by `esbuild`).
  Pulls in only the TCP-free libp2p surface (`@optimystic/db-p2p/rn`) plus the
  WebSockets and circuit-relay transports, and defaults storage to IndexedDB.
  Current size: ~2.5 MiB raw, ~545 KiB gzipped.

Load it from Quoomb-web via the Plugins panel or `quoomb.config.json`:

```json
{
  "plugins": [
    {
      "source": "https://your-host/path/plugin-browser.js",
      "config": {
        "strand_id": "550e8400-e29b-41d4-a716-446655440000",
        "bootstrap_nodes": "/dns4/relay.example/tcp/443/wss/p2p/Qm..."
      }
    }
  ],
  "autoload": true
}
```

Quoomb-web's worker does a native `import(url)` via plugin-loader's
`dynamicLoadModule`. The URL must serve the file with `Content-Type: text/javascript`
(or `application/javascript`) and CORS appropriate for the page origin.

**Storage.** When `storage` is not injected, the browser bundle opens a
default `IndexedDBRawStorage` against an IndexedDB database named
`sereus-strand-<strandId>`. State survives page reload. The plugin treats the
IndexedDB handle as borrowed and does **not** close it on `shutdown()` — the
lifecycle is the page/worker, not the plugin.

**Bootstrap multiaddrs.** Browsers can only dial transports that are reachable
from a `https://` page. Use `/wss` (or `/dns/.../wss`, or a relay-fronted
multiaddr). Plain `/tcp/.../ws` over HTTP won't dial from a TLS origin, and
raw TCP is unavailable in the browser.

**Limitations (v1).**

- WebSockets + circuit-relay only. WebRTC requires cross-origin isolation
  (COOP/COEP) and is tracked as a follow-up.
- No code-splitting between bootstrap and networked mode — the bundle is fetched
  once per worker session, so the saving doesn't justify the extra round trip.

### Bootstrap mode (solo node with persistent storage)

For a solo node (e.g. first-launch sApp init, single-host dev) that should
apply schema and accept DML without peer round trips, set `mode: 'bootstrap'`
and pass a persistent `IRawStorage`. The same storage instance is wired into
both the libp2p data path and the optimystic plugin's local transactor, so
writes persist across restart.

```typescript
import { FileRawStorage } from '@optimystic/db-p2p-storage-fs';

const storage = new FileRawStorage('./data/my-strand');
const strand = await connectToStrand(db, {
  strandId: 'abc',
  mode: 'bootstrap',
  storage,
  schema: 'table Msg (Id integer primary key, Body text not null)',
});
```

The plugin treats `storage` as borrowed: `shutdown()` releases the libp2p node
and collection factory but does **not** close the storage. Lifecycle of the
storage is the caller's responsibility.

### With Injected Node

When integrating with an existing CadreNode or other libp2p host:

```typescript
const strand = await connectToStrand(db, {
  strandId: 'abc',
  libp2pNode: existingNode,
  coordinatedRepo: existingRepo,
});
```

The plugin will use the injected node instead of creating one, and will not stop it on shutdown.

## Configuration

### `StrandConnectionOptions` (programmatic API)

| Option | Type | Default | Description |
|---|---|---|---|
| `strandId` | string | *required* | UUID of the strand to connect to |
| `bootstrapNodes` | string[] | `[]` | Bootstrap multiaddrs for peer discovery |
| `schema` | string | — | sApp schema DDL to apply |
| `sAppId` | string | `'unknown'` | sApp author public key |
| `sAppVersion` | string | `'1.0.0'` | sApp version |
| `port` | number | `0` | libp2p listening port (0 = random) |
| `enableCache` | boolean | `true` | Enable optimystic caching |
| `fretProfile` | `'edge' \| 'core'` | `'edge'` | FRET profile |
| `libp2pNode` | Libp2p | — | Inject an existing libp2p node |
| `coordinatedRepo` | IRepo | — | Required when `libp2pNode` is provided |
| `mode` | `'bootstrap' \| 'networked'` | `'networked'` | `'bootstrap'` routes through the local transactor (no peer round trips); `'networked'` uses the network transactor |
| `storage` | IRawStorage | — | Persistent raw storage. Passed to `createLibp2pNode`; in `bootstrap` mode also wired into the local transactor via `rawStorageFactory`. Borrowed — not closed on `shutdown()` |

### Plugin Settings (plugin-loader / Quoomb)

| Setting | Type | Default | Description |
|---|---|---|---|
| `strand_id` | string | *required* | UUID of the strand |
| `bootstrap_nodes` | string | `''` | Comma-separated bootstrap multiaddrs |
| `schema` | string | — | sApp schema DDL |
| `sapp_id` | string | `'unknown'` | sApp author public key |
| `sapp_version` | string | `'1.0.0'` | sApp version |
| `port` | number | `0` | libp2p listening port |
| `enable_cache` | boolean | `true` | Enable caching |
| `fret_profile` | string | `'edge'` | FRET profile (`'edge'` or `'core'`) |

## Provided Functions and Modules

Registered automatically from the composed plugins:

- **Virtual table module**: `optimystic` (set as default vtab)
- **Functions**: `StampId()`, `digest()`, `sign()`, `verify()`, `randomBytes()`

## Development

```bash
yarn build    # tsc + esbuild (emits dist/plugin.js and dist/plugin-browser.js)
yarn test     # Run tests (unit + e2e projects, plus browser-bundle smoke tests)
yarn test:e2e # Run only the e2e project (real libp2p + FileRawStorage)
yarn dev:test # Watch mode
```

The `build` script runs `tsc -p tsconfig.build.json` (emits `dist/plugin.js`,
`dist/plugin-browser.js` declarations, and other entries) and then
`node scripts/build-browser.mjs` (overwrites `dist/plugin-browser.js` with the
bundled artifact and its sourcemap, and prints raw + gzipped size).

The browser-bundle smoke tests (`test/browser-bundle.spec.ts` and
`test/browser-shape.spec.ts`) run under the `unit` project. They build the
bundle on demand if it's missing, then check that the artifact parses as ESM,
has no Node-only or TCP imports, stays under the size caps, and that its
default export reaches the IndexedDB layer when invoked in a jsdom +
`fake-indexeddb` environment.

The `e2e` project covers two scenarios over real libp2p + `FileRawStorage`:

- `test/e2e/bootstrap.e2e.spec.ts` — solo-node bootstrap mode, including
  cold-restart persistence across the shared storage directory.
- `test/e2e/networked.e2e.spec.ts` — two in-process peers exchanging strand
  data through a `createLibp2pNode` mesh: cross-peer replication,
  bidirectional convergence, and late-joiner catch-up.

## License

MIT
