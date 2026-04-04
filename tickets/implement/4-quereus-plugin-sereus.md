description: Create @serfab/quereus-plugin-sereus - a Quereus plugin that connects to a Sereus strand for SQL access
dependencies: @optimystic/quereus-plugin-optimystic, @optimystic/quereus-plugin-crypto, @optimystic/db-p2p, @quereus/quereus
files:
  - packages/quereus-plugin-sereus/package.json
  - packages/quereus-plugin-sereus/tsconfig.json
  - packages/quereus-plugin-sereus/tsconfig.build.json
  - packages/quereus-plugin-sereus/vitest.config.ts
  - packages/quereus-plugin-sereus/src/plugin.ts
  - packages/quereus-plugin-sereus/src/connect.ts
  - packages/quereus-plugin-sereus/src/types.ts
  - packages/quereus-plugin-sereus/src/index.ts
  - packages/quereus-plugin-sereus/test/plugin.spec.ts
  existing references:
  - packages/cadre-core/src/strand-database.ts (pattern to follow)
  - packages/cadre-core/src/control-database.ts (pattern to follow)
  - ../optimystic/packages/quereus-plugin-optimystic/src/plugin.ts (composed plugin)
  - ../optimystic/packages/quereus-plugin-optimystic/src/optimystic-adapter/collection-factory.ts (registerLibp2pNode)
  - ../quereus/packages/plugin-loader/src/plugin-loader.ts (plugin loading interface)
----

## Overview

A Quereus plugin that connects to a Sereus strand, allowing SQL queries and mutations against distributed strand data from any Quereus consumer: Quoomb CLI, Quoomb Web, or direct programmatic use.

This plugin **composes** the existing `@optimystic/quereus-plugin-crypto` and `@optimystic/quereus-plugin-optimystic` plugins rather than reinventing them.  It adds the Sereus-specific wiring: strand network naming conventions, libp2p node creation, default vtab configuration, and optional sApp schema application.

## Architecture

```
Consumer (Quoomb CLI / Web / app)
  |
  v
@serfab/quereus-plugin-sereus          <-- this plugin
  |  composes:
  +-- @optimystic/quereus-plugin-crypto    (digest, sign, verify functions)
  +-- @optimystic/quereus-plugin-optimystic (optimystic vtable, StampId, CollectionFactory)
  |  creates:
  +-- createLibp2pNode()                    (joins strand-${strandId} network)
  |  configures:
  +-- db.setDefaultVtabName('optimystic')
  +-- db.setDefaultVtabArgs({ networkName, transactor, keyNetwork })
  |  optionally:
  +-- executes sApp schema DDL (declare schema App { ... } apply schema App;)
```

## Two Entry Points

### 1. Plugin entry (`plugin.ts`) - for plugin-loader / Quoomb

Standard Quereus plugin default export: `(db: Database, config: Record<string, SqlValue>) => Promise<SereusPluginResult>`.

Loaded via Quoomb's `.plugin install` or config file, or via `registerPlugin()`.

Config keys (all `SqlValue`):

| Key | Type | Required | Default | Description |
|-----|------|----------|---------|-------------|
| `strand_id` | text | yes | - | UUID of the strand |
| `bootstrap_nodes` | text | no | `''` | Comma-separated multiaddrs |
| `schema` | text | no | - | sApp DDL (tables within the strand) |
| `sapp_id` | text | no | `'unknown'` | sApp author public key |
| `sapp_version` | text | no | `'1.0.0'` | sApp version string |
| `port` | number | no | `0` | libp2p listening port (0 = random) |
| `enable_cache` | boolean | no | `true` | Enable optimystic caching |
| `fret_profile` | text | no | `'edge'` | FRET profile: `'edge'` or `'core'` |

### 2. Programmatic API (`connect.ts`) - for direct integration

```typescript
export async function connectToStrand(
  db: Database,
  options: StrandConnectionOptions
): Promise<SereusPluginResult>
```

`StrandConnectionOptions` accepts richer types including an optional pre-existing `libp2pNode` and `coordinatedRepo` (for use inside CadreNode or tests).

## Key Types (`types.ts`)

```typescript
import type { Libp2p } from '@libp2p/interface';
import type { IRepo } from '@optimystic/db-core';

export interface StrandConnectionOptions {
  /** UUID of the strand to connect to */
  strandId: string;
  /** Bootstrap multiaddrs for peer discovery */
  bootstrapNodes?: string[];
  /** sApp schema DDL to apply (optional - omit if schema already exists on strand) */
  schema?: string;
  /** sApp author public key */
  sAppId?: string;
  /** sApp version */
  sAppVersion?: string;
  /** libp2p listening port (default: 0 = random) */
  port?: number;
  /** Enable optimystic caching (default: true) */
  enableCache?: boolean;
  /** FRET profile (default: 'edge') */
  fretProfile?: 'edge' | 'core';
  /** Inject an existing libp2p node instead of creating one */
  libp2pNode?: Libp2p;
  /** Required when libp2pNode is provided */
  coordinatedRepo?: IRepo;
}

export interface SereusPluginResult {
  vtables: [];
  functions: [];
  collations: [];
  /** Shuts down the libp2p node and collection factory. Call when done. */
  shutdown: () => Promise<void>;
}
```

## Registration Flow (inside `connectToStrand`)

This mirrors the pattern in `strand-database.ts:56-117` but packages it as a composable plugin:

1. Register crypto plugin: `await registerPlugin(db, cryptoPlugin)`
2. Call optimystic plugin directly: `optimysticPlugin(db, { default_transactor, default_key_network, default_network_name, enable_cache })`
3. Manually register returned vtables and functions with `db.registerModule()` / `db.registerFunction()`
4. Save reference to `collectionFactory` from the result
5. Create libp2p node (if not injected): `createLibp2pNode({ port, bootstrapNodes, networkName: 'strand-${strandId}', fretProfile, ... })`
6. Register node: `collectionFactory.registerLibp2pNode(networkName, node, coordinatedRepo)`
7. Set defaults: `db.setDefaultVtabName('optimystic')`, `db.setDefaultVtabArgs({ networkName, transactor: 'network', keyNetwork: 'libp2p' })`
8. If `schema` provided: `db.exec('declare schema App { ${schema} } apply schema App;')`
9. Return `SereusPluginResult` with empty registrations (already registered) + `shutdown()`

## Package Layout

```
packages/quereus-plugin-sereus/
  package.json
  tsconfig.json
  tsconfig.build.json
  vitest.config.ts
  src/
    plugin.ts      - Default export: plugin registration function (for plugin-loader)
    connect.ts     - connectToStrand() programmatic API
    types.ts       - StrandConnectionOptions, SereusPluginResult
    index.ts       - Re-exports: connectToStrand, types
  test/
    plugin.spec.ts - Tests
```

### package.json essentials

- name: `@serfab/quereus-plugin-sereus`
- type: `module`
- main: `dist/index.js`
- exports: `"."` → `dist/index.js`, `"./plugin"` → `dist/plugin.js`
- dependencies: `@quereus/quereus`, `@optimystic/quereus-plugin-crypto`, `@optimystic/quereus-plugin-optimystic`, `@optimystic/db-core`, `@optimystic/db-p2p`, `@libp2p/interface`, `debug`
- devDependencies: `typescript`, `vitest`, `rimraf`
- quereus metadata in package.json (for plugin-loader manifest):
  ```json
  "quereus": {
    "provides": {
      "vtables": ["optimystic"],
      "functions": ["StampId", "digest", "sign", "verify", "randomBytes"]
    },
    "settings": [
      { "key": "strand_id", "type": "string" },
      { "key": "bootstrap_nodes", "type": "string", "default": "" },
      { "key": "schema", "type": "string" },
      { "key": "sapp_id", "type": "string", "default": "unknown" },
      { "key": "sapp_version", "type": "string", "default": "1.0.0" },
      { "key": "port", "type": "number", "default": 0 },
      { "key": "enable_cache", "type": "boolean", "default": true },
      { "key": "fret_profile", "type": "string", "default": "edge" }
    ]
  }
  ```

## Usage Examples

### Quoomb CLI config

```json
{
  "plugins": [{
    "source": "@serfab/quereus-plugin-sereus",
    "config": {
      "strand_id": "550e8400-e29b-41d4-a716-446655440000",
      "bootstrap_nodes": "/ip4/203.0.113.42/tcp/9100/p2p/12D3KooWAbcDef...",
      "schema": "table Message (Id integer primary key, Content text not null, Timestamp datetime not null)",
      "sapp_id": "chat-app-author-key",
      "sapp_version": "0.1.0"
    }
  }],
  "autoload": true
}
```

Then in Quoomb REPL:
```sql
select * from App.Message;
insert into App.Message values (1, 'Hello from Quoomb!', datetime('now'));
```

### Programmatic use

```typescript
import { Database } from '@quereus/quereus';
import { connectToStrand } from '@serfab/quereus-plugin-sereus';

const db = new Database();
const strand = await connectToStrand(db, {
  strandId: '550e8400-...',
  bootstrapNodes: ['/ip4/203.0.113.42/tcp/9100/p2p/12D3KooW...'],
  schema: 'table Message (Id integer primary key, Content text not null)',
});

for await (const row of db.eval('select * from App.Message')) {
  console.log(row);
}

await strand.shutdown();
```

### Inside CadreNode (injected node)

```typescript
import { connectToStrand } from '@serfab/quereus-plugin-sereus';

const db = new Database();
const strand = await connectToStrand(db, {
  strandId: 'abc-123',
  libp2pNode: existingNode,
  coordinatedRepo: existingRepo,
  schema: appSchema,
});
```

## Test Plan

Tests use `transactor: 'test'` and no real network (mocked/in-memory).

- **Config parsing**: various config shapes produce correct `StrandConnectionOptions`; missing `strand_id` throws
- **Plugin registration**: plugin registers crypto functions (`digest`, `verify`) and optimystic vtable; `StampId()` is callable
- **Schema application**: with `schema` config, tables are queryable under `App.*`; without schema, no `App` schema exists
- **Programmatic API with injected node**: uses provided node, does not call `createLibp2pNode`
- **Shutdown**: after shutdown, collection factory and libp2p node are stopped
- **Default vtab**: tables created without `USING` clause use the optimystic module

## TODO

### Phase 1: Package scaffolding
- Create package directory and config files (package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts)
- Add to workspace (root package.json already uses `packages/*` glob)

### Phase 2: Core implementation
- Implement `types.ts` with `StrandConnectionOptions` and `SereusPluginResult`
- Implement `connect.ts` with `connectToStrand()` function
- Implement `plugin.ts` with default export that parses SqlValue config and delegates to `connectToStrand()`
- Implement `index.ts` with re-exports

### Phase 3: Tests
- Write tests for config parsing, plugin registration, schema application, injected node, shutdown, default vtab

### Phase 4: Build verification
- Ensure `yarn build` succeeds for the new package
- Ensure `yarn test` passes
- Ensure the full workspace build still passes
