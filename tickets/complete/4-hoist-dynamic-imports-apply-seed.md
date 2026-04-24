priority: 2
description: Replace inline dynamic imports in applySeed() with top-level imports or dependency injection
prereq: packages/cadre-core/src/seed-bootstrap.ts
----

## Resolution

Already fixed in commit `937d52b` ("Removed dynamic imports - RN portability").

All imports in `seed-bootstrap.ts` are static top-level imports. There are zero inline `import()` calls in the file. No code changes needed.

## Testing

All 122 cadre-core tests pass (10 test files).
