description: Review @serfab/quereus-plugin-sereus - Quereus plugin connecting to Sereus strands for SQL access
dependencies: @optimystic/quereus-plugin-optimystic, @optimystic/quereus-plugin-crypto, @optimystic/db-p2p, @quereus/quereus
files:
  - packages/quereus-plugin-sereus/package.json
  - packages/quereus-plugin-sereus/tsconfig.json
  - packages/quereus-plugin-sereus/tsconfig.build.json
  - packages/quereus-plugin-sereus/vitest.config.ts
  - packages/quereus-plugin-sereus/src/types.ts
  - packages/quereus-plugin-sereus/src/connect.ts
  - packages/quereus-plugin-sereus/src/plugin.ts
  - packages/quereus-plugin-sereus/src/index.ts
  - packages/quereus-plugin-sereus/test/plugin.spec.ts
----

## Summary

Created `@serfab/quereus-plugin-sereus`, a Quereus plugin that connects to a Sereus strand for SQL queries and mutations. The plugin composes `@optimystic/quereus-plugin-crypto` and `@optimystic/quereus-plugin-optimystic` rather than reinventing them.

## Key Design Decisions

- **Two entry points**: `plugin.ts` (default export for plugin-loader/Quoomb) and `connect.ts` (`connectToStrand()` programmatic API)
- **Composing plugins**: Registers crypto and optimystic plugins, then registers their vtables/functions manually to retain access to `collectionFactory`
- **Node lifecycle**: Creates a libp2p node when none is injected; skips node creation entirely for non-network transactors (e.g. `transactor: 'test'`)
- **Schema application**: Wraps provided DDL in `declare schema App { ... } apply schema App;`
- **Shutdown**: Stops the collection factory; only stops the libp2p node if the plugin created it (not for injected nodes)
- **`transactor` option** (`@internal`): Added to `StrandConnectionOptions` to support `'test'` transactor for unit testing without real networking

## Use Cases for Testing/Validation

### Plugin entry (Quoomb / plugin-loader)
```typescript
import register from '@serfab/quereus-plugin-sereus/plugin';
const result = await register(db, { strand_id: '550e8400-...', schema: 'table Msg (...)' });
// ... use db ...
await result.shutdown();
```

### Programmatic API
```typescript
import { connectToStrand } from '@serfab/quereus-plugin-sereus';
const strand = await connectToStrand(db, { strandId: '550e8400-...', schema: '...' });
// ... use db ...
await strand.shutdown();
```

### With injected node (CadreNode integration)
```typescript
const strand = await connectToStrand(db, {
  strandId: 'abc',
  libp2pNode: existingNode,
  coordinatedRepo: existingRepo,
});
```

## Test Coverage (21 tests, all passing)

### Config parsing (10 tests)
- Minimal config with defaults
- Missing/empty strand_id throws
- Comma-separated bootstrap_nodes parsing
- All SqlValue config fields parsed correctly

### Plugin registration (2 tests)
- Crypto functions registered (digest callable)
- StampId function registered

### Schema application (2 tests)
- Tables queryable under App.* when schema provided
- No App schema when schema omitted

### Node management (4 tests)
- Injected node used without calling createLibp2pNode
- Missing coordinatedRepo with injected node throws
- Node creation skipped for test transactor
- Node created for network transactor

### Lifecycle (3 tests)
- Valid SereusPluginResult shape returned
- Created node stopped on shutdown
- Default vtab set to optimystic (tables via declare schema use optimystic module)
