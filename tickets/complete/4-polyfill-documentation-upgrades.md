description: Updated polyfill documentation to reflect code upgrades and added quality guidance
dependencies: 3-polyfill-code-upgrades (complete)
files:
  - packages/reference-app-rn/README.md
  - docs/reference-app-rn.md
  - docs/cadre-architecture.md
----

## What was built

Updated polyfill documentation in both `packages/reference-app-rn/README.md` and `docs/reference-app-rn.md` to reflect the polyfill code upgrades from ticket 3-polyfill-code-upgrades, and added guidance sections to prevent future divergence.

### Changes

- **Polyfill inventory tables** — Updated notes for `crypto.getRandomValues` (react-native-get-random-values + Math.random fallback), `structuredClone` (@ungap/structured-clone), added `Symbol.asyncIterator` and `ReadableStream`/`WritableStream`/`TransformStream` rows
- **Built-in APIs table** — Added "Available since" column with Hermes/Expo SDK/RN version notes (TextEncoder, TextDecoder, BigInt, crypto.getRandomValues)
- **Polyfill quality principles** — New section on preferring npm packages, spec compliance, typeof guards, native module rebuild notes
- **Commonly needed beyond core** — Table of polyfills apps may need beyond the core stack (URL/URLSearchParams)
- **Troubleshooting** — Updated structuredClone entry to reference @ungap/structured-clone
- **cadre-architecture.md** — Cross-reference verified; generic wording, no changes needed

### Review fixes

During review, fixed 4 minor "Required by" inconsistencies in README.md to match docs/reference-app-rn.md and code comments:
- `crypto.getRandomValues` — added `@noble/curves`
- `structuredClone` — "cache" → "cache-source"
- `Promise.withResolvers` — added `abort-error`
- `AbortSignal.prototype.throwIfAborted` — added `@libp2p/circuit-relay-v2`

## Key files

| File | Role |
|------|------|
| `packages/reference-app-rn/README.md` | Package-level quick reference for polyfills |
| `docs/reference-app-rn.md` | Architecture docs with detailed polyfill notes |
| `packages/reference-app-rn/polyfills/hermes.js` | Actual polyfill code (source of truth) |
| `docs/cadre-architecture.md` | Cross-reference to polyfill docs (line ~749) |

## Testing

- Build passes (`yarn build`)
- All 25 tests pass across 3 test files (`yarn test`)
- Polyfill inventory tables in both files verified consistent with each other and with `polyfills/hermes.js`
- Built-in API version claims verified (TextEncoder, TextDecoder, BigInt, crypto.getRandomValues)
- Markdown table formatting verified
- cadre-architecture.md `#polyfills` anchor link verified
