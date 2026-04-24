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
yarn build    # Build with tsc
yarn test     # Run tests (vitest)
yarn dev:test # Watch mode
```

## License

MIT
