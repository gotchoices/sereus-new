priority: 2
description: Replace inline dynamic imports in applySeed() with top-level imports or dependency injection
dependencies: packages/cadre-core/src/seed-bootstrap.ts
----
The `applySeed()` function uses inline `import()` calls that should be hoisted to the top of the file or injected as dependencies. This is inconsistent with codebase conventions and makes testing harder.

## TODO
- [ ] Identify all inline `import()` calls in `seed-bootstrap.ts`
- [ ] Hoist to top-level imports or inject as constructor/function parameters
- [ ] Verify tests pass after refactoring
