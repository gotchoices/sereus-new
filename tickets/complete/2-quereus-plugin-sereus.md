description: @serfab/quereus-plugin-sereus - Quereus plugin connecting to Sereus strands for SQL access
files:
  - packages/quereus-plugin-sereus/package.json
  - packages/quereus-plugin-sereus/src/types.ts
  - packages/quereus-plugin-sereus/src/connect.ts
  - packages/quereus-plugin-sereus/src/plugin.ts
  - packages/quereus-plugin-sereus/src/index.ts
  - packages/quereus-plugin-sereus/test/plugin.spec.ts
  - packages/quereus-plugin-sereus/README.md
----

## Summary

Created `@serfab/quereus-plugin-sereus`, a Quereus plugin that connects to a Sereus strand for SQL queries and mutations. The plugin composes `@optimystic/quereus-plugin-crypto` and `@optimystic/quereus-plugin-optimystic` rather than reinventing them.

## Review Findings and Fixes

- **Resource leak fix**: Moved `createdNode` assignment before the `coordinatedRepo` validation check in `connect.ts`, so the node is tracked for cleanup even if the check throws.
- **Error cleanup**: Added try/catch around the resource initialization section (steps 4-7) so that the collection factory and any created libp2p node are properly cleaned up if schema application or node registration fails.
- **README**: Created `README.md` covering programmatic API, plugin-loader usage, injected node integration, configuration tables, and development commands.

## Key Design

- Two entry points: `plugin.ts` (plugin-loader/Quoomb) and `connect.ts` (`connectToStrand()` programmatic API)
- Composes crypto and optimystic plugins; registers their vtables/functions manually to retain `collectionFactory` access
- Creates a libp2p node when none injected; skips for non-network transactors
- Schema wrapped in `declare schema App { ... } apply schema App;`
- Shutdown cleans up collection factory; only stops libp2p node if plugin created it

## Testing

21 tests across: config parsing (10), plugin registration (2), schema application (2), node management (4), lifecycle (3). All passing.
