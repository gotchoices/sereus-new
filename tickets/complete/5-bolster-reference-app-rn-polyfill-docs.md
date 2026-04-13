description: Bolstered reference-app-rn.md polyfill section with copy-pasteable deps, source file index, EventTarget alternatives, and stronger warnings
files: docs/reference-app-rn.md, packages/reference-app-rn/package.json
----

## What was built

1. **`packages/reference-app-rn/package.json`** — Added `@noble/hashes: ^2.0.0` as a direct dependency to prevent transitive resolution fragility.

2. **`docs/reference-app-rn.md`** — Five documentation improvements:
   - Copy-pasteable JSON block of required polyfill dependencies with rationale
   - Full `packages/reference-app-rn/polyfills/` paths in source file reference tables
   - Timer `.ref()`/`.unref()` pointer to exact `hermes.js` section
   - EventTarget alternatives paragraph with migration instructions for `event-target-polyfill`
   - `fast-text-encoding` promoted to blockquote warning with bundle waste and double-encoding rationale

## Testing notes

- `yarn test:bundle` passes — 9.34 MB bundle, ~2800 modules
- `yarn test` — 25/25 tests pass, no regressions
- `@noble/hashes` v2.0.1 installed and resolves correctly under `packages/reference-app-rn/node_modules/`
- Doc JSON dep block verified against actual `package.json` — all 6 entries match
- All 5 polyfill source files exist at documented paths
- Markdown tables balanced, fences closed, blockquote well-formed

## Usage

Downstream apps following the polyfill guide can:
- Copy the JSON dep block into their `package.json` to get all required polyfill deps
- Choose between inline `polyfills/event.js` or `event-target-polyfill` with clear migration steps
- Avoid the `fast-text-encoding` pitfall via the prominent warning
- Locate polyfill source files unambiguously via full paths
