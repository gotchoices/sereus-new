description: Bolster reference-app-rn.md polyfill section with copy-pasteable deps, source file index, EventTarget alternatives, and stronger warnings
dependencies: none
files: docs/reference-app-rn.md, packages/reference-app-rn/package.json
----

## Summary

Improved the polyfill documentation in `docs/reference-app-rn.md` and promoted `@noble/hashes` to a direct dependency to prevent transitive resolution fragility.

### Changes made

1. **`packages/reference-app-rn/package.json`** — Added `"@noble/hashes": "^2.0.0"` as a direct dependency (previously resolved transitively via libp2p).

2. **`docs/reference-app-rn.md`** — Five doc improvements:
   - **"Required polyfill dependencies" subsection** — New section with a copy-pasteable JSON block listing all polyfill deps that must be direct (not transitive). Calls out `@noble/hashes` specifically with rationale.
   - **Source file references** — "Other global polyfills" and "Metro module aliases" tables now use full `packages/reference-app-rn/polyfills/` paths so downstream apps can locate source files unambiguously.
   - **Timer source pointer** — Added parenthetical to the Timer `.ref()`/`.unref()` row pointing to the exact section in `hermes.js`.
   - **EventTarget alternatives** — New paragraph after the event.js row documenting both the inline approach and the `event-target-polyfill` npm package alternative, with migration instructions.
   - **`fast-text-encoding` warning** — Promoted from a soft table note to a blockquote callout explaining bundle waste and double-encoding risks.

## Testing / validation

- `yarn test:bundle` (Metro bundle smoke test) passes — 9.34 MB bundle with ~2800 modules
- `@noble/hashes` fetched and present in lockfile (17 references)
- Markdown tables verified: balanced pipes, no broken fences, blockquote renders correctly
- `yarn install` fetch step succeeds; link error is pre-existing cross-workspace issue unrelated to this change

## Key use cases for review

- Downstream app following the doc should be able to copy the JSON dep block into their `package.json` and have all polyfill deps covered
- An app choosing `event-target-polyfill` over inline `polyfills/event.js` has clear migration steps
- The `fast-text-encoding` warning is prominent enough that teams won't accidentally add it
- Source file paths are unambiguous for apps that fork/inline polyfills
