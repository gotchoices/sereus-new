description: Review upgraded and new polyfills in reference-app-rn
dependencies: packages/reference-app-rn, react-native-get-random-values, @ungap/structured-clone, web-streams-polyfill
files:
  - packages/reference-app-rn/polyfills/hermes.js
  - packages/reference-app-rn/package.json
----

## Summary

Upgraded two weak polyfills and added two missing ones in the reference app's Hermes polyfill layer.

### Changes

**1. crypto.getRandomValues — upgraded**
- Added `react-native-get-random-values` (native CSPRNG) as a `require()` at the very top of `hermes.js`
- The package self-installs on `globalThis.crypto.getRandomValues`; no-op if native API already exists
- Kept the Math.random fallback as last resort, upgraded `console.warn` → `console.error` with stronger language
- **Requires native rebuild** (EAS Build or local native build)

**2. structuredClone — upgraded**
- Replaced `JSON.parse(JSON.stringify(value))` body with `@ungap/structured-clone` default export
- Correctly handles `undefined`, `Date`, `Map`, `Set`, `RegExp`, circular references
- Kept the `typeof` guard so native `structuredClone` is used when available
- Pure JS, no native rebuild required

**3. Symbol.asyncIterator — new**
- Guards against Hermes versions that omit `Symbol.asyncIterator`
- Prevents `for await...of` breakage on custom async iterables
- Pure JS, no native rebuild required

**4. Web Streams API — new**
- Polyfills `ReadableStream`, `WritableStream`, `TransformStream` via `web-streams-polyfill`
- Required by Vercel AI SDK and streaming-oriented libraries
- Guarded by `typeof globalThis.ReadableStream === 'undefined'`
- Pure JS, no native rebuild required

## Testing / Validation

- `yarn test:bundle` passes — Metro successfully bundles all 2852 modules including the new imports
- All polyfills use `typeof` guards — skipped when native API exists, installed otherwise
- `react-native-get-random-values` uses `require()` (not ES import) since hermes.js is CommonJS
- `@ungap/structured-clone`'s `.default` export is correctly accessed
- Ordering: `react-native-get-random-values` require is first (before the crypto object setup block), Symbol.asyncIterator before Web Streams, all before existing Promise.withResolvers/AbortSignal/Timer polyfills

## Key Review Points

- Verify the `react-native-get-random-values` import placement at very top before any crypto setup
- Verify `@ungap/structured-clone` `.default` access is correct for CJS require
- Verify `web-streams-polyfill` exports `ReadableStream`/`WritableStream`/`TransformStream` at top level
- Check that no existing polyfills were accidentally disturbed
- Ensure the native rebuild note is documented for downstream apps
