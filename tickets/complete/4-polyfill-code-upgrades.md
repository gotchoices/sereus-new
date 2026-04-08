description: Upgraded and added polyfills in reference-app-rn Hermes layer
files:
  - packages/reference-app-rn/polyfills/hermes.js
  - packages/reference-app-rn/package.json
  - packages/reference-app-rn/README.md
  - docs/reference-app-rn.md
----

## What was built

Upgraded two weak polyfills and added two new ones in the reference app's Hermes polyfill layer (`polyfills/hermes.js`):

1. **crypto.getRandomValues** — added `react-native-get-random-values` (native CSPRNG) as the primary source, kept Math.random fallback with `console.error` warning. Requires native rebuild.
2. **structuredClone** — replaced `JSON.parse(JSON.stringify())` with `@ungap/structured-clone` (spec-compliant: handles Date, Map, Set, RegExp, circular refs).
3. **Symbol.asyncIterator** — new one-liner guard for Hermes versions that omit it.
4. **Web Streams API** — new polyfill for `ReadableStream`, `WritableStream`, `TransformStream` via `web-streams-polyfill`, required by Vercel AI SDK.

All polyfills use `typeof` guards and are skipped when native APIs exist.

## Review findings

- Code is clean, well-structured, and follows single-responsibility per block
- All `typeof` guards correctly prevent double-patching
- `@ungap/structured-clone` `.default` export access verified correct for CJS require
- `web-streams-polyfill` top-level exports verified (`ReadableStream`, `WritableStream`, `TransformStream`)
- `react-native-get-random-values` placed at very top (line 10) before any crypto setup — correct
- Ordering: CSPRNG → crypto object → crypto.subtle → crypto.getRandomValues fallback → structuredClone → Symbol.asyncIterator → Web Streams → Promise.withResolvers → AbortSignal → Timers
- No existing polyfills were disturbed
- **Doc fix during review**: removed Web Streams and Symbol.asyncIterator from "Commonly needed beyond core" tables in README.md and docs/reference-app-rn.md since they are now core polyfills

## Testing

- `yarn test:bundle` passes — Metro successfully bundles all modules including new imports
- Package export verification via Node.js confirmed correct types for all three new dependencies
- Documentation inventory tables match the actual hermes.js implementation

## Review doc fix

Removed Web Streams and Symbol.asyncIterator from "Commonly needed beyond core" tables in both README.md and docs/reference-app-rn.md — these are now core polyfills in hermes.js and were stale entries.

## Dependencies added

- `react-native-get-random-values` ^1.11.0 (native module — requires dev client rebuild)
- `@ungap/structured-clone` ^1.3.0 (pure JS)
- `web-streams-polyfill` ^4.1.0 (pure JS)
