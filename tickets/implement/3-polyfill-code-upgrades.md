description: Upgrade weak polyfills and add missing ones in reference-app-rn
dependencies: packages/reference-app-rn, react-native-get-random-values, @ungap/structured-clone, web-streams-polyfill
files:
  - packages/reference-app-rn/polyfills/hermes.js
  - packages/reference-app-rn/index.js
  - packages/reference-app-rn/package.json
----

## Context

The reference app's polyfill set has two weak implementations and two missing polyfills. The app uses RN 0.79.6 / Expo SDK 53 / Hermes. It's the canonical polyfill reference for any RN app on the sereus stack.

## Upgrade: crypto.getRandomValues

**Current**: Math.random() fallback (lines 37-48 of hermes.js). Cryptographically insecure.

**Target**: `react-native-get-random-values` — a native module that provides a proper CSPRNG via the platform's native random source. It self-installs on `globalThis.crypto.getRandomValues` when imported.

**Approach**:
- Add `react-native-get-random-values` to package.json dependencies
- Import it at the very top of `polyfills/hermes.js` (before the crypto object setup)
- Keep the existing typeof guard + Math.random fallback as a last resort, but upgrade the console.warn to console.error with stronger language ("INSECURE — only for development without a native build")
- The `crypto` object creation block (lines 10-12) should remain, since `react-native-get-random-values` expects `globalThis.crypto` to exist or creates it

**Note**: RN 0.76+ with New Architecture may already provide this natively. The `react-native-get-random-values` package is a no-op when the native API exists, so it's safe to always import. The typeof guard means zero overhead on environments that already have it.

**Native rebuild required**: Yes — `react-native-get-random-values` includes native code. Downstream apps need an EAS Build or local native build after adding this dep. Document this in the commit and README.

## Upgrade: structuredClone

**Current**: `JSON.parse(JSON.stringify(value))` (lines 54-59 of hermes.js). Silently drops `undefined`, functions, `Date` objects (become strings), `Map`, `Set`, `RegExp`, and circular references.

**Target**: `@ungap/structured-clone` — spec-compliant implementation that handles all of the above correctly.

**Approach**:
- Add `@ungap/structured-clone` to package.json dependencies
- Replace the JSON round-trip body with a call to the package's default export
- Keep the typeof guard so native structuredClone is used when available (Hermes may add it in future)

```js
if (typeof globalThis.structuredClone !== 'function') {
	const _structuredClone = require('@ungap/structured-clone').default;
	globalThis.structuredClone = function structuredClone(value) {
		return _structuredClone(value);
	};
}
```

**Pure JS**: No native rebuild required.

## Add: Web Streams API

**Missing**: `ReadableStream`, `WritableStream`, `TransformStream`. Required by Vercel AI SDK and increasingly common in streaming libraries.

**Target**: `web-streams-polyfill`

**Approach**:
- Add `web-streams-polyfill` to package.json dependencies
- Add a new section to `polyfills/hermes.js` after structuredClone:

```js
// ── Web Streams API ────────────────────────────────────────────────────────
// Required by: Vercel AI SDK, streaming-oriented libraries
// Not yet supported by Hermes.

if (typeof globalThis.ReadableStream === 'undefined') {
	const webStreams = require('web-streams-polyfill');
	globalThis.ReadableStream = webStreams.ReadableStream;
	globalThis.WritableStream = webStreams.WritableStream;
	globalThis.TransformStream = webStreams.TransformStream;
}
```

**Pure JS**: No native rebuild required.

## Add: Symbol.asyncIterator

**Missing**: Some Hermes versions don't register `Symbol.asyncIterator`, breaking `for await...of` over custom async iterables.

**Approach**: Add to `polyfills/hermes.js` before the Web Streams section:

```js
// ── Symbol.asyncIterator ───────────────────────────────────────────────────
// Some Hermes versions omit this, breaking `for await...of` on custom iterables.

if (typeof Symbol.asyncIterator === 'undefined') {
	Symbol.asyncIterator = Symbol('Symbol.asyncIterator');
}
```

**Pure JS**: No native rebuild required.

## Testing

Key tests/validation for the implementing agent:

- `yarn test:bundle` in packages/reference-app-rn must pass (Metro bundle resolves all new imports)
- Manually verify the typeof guards: each polyfill should be skipped if the native API exists, installed otherwise
- Verify `react-native-get-random-values` uses `require()` (not ES import) in hermes.js since hermes.js is CommonJS
- Verify `@ungap/structured-clone`'s default export is correctly accessed (it exports `{ default: fn }` from CJS)

## TODO

- Add `react-native-get-random-values`, `@ungap/structured-clone`, `web-streams-polyfill` to packages/reference-app-rn/package.json dependencies
- Run `yarn install` from monorepo root
- Update polyfills/hermes.js: add `require('react-native-get-random-values')` at top
- Update polyfills/hermes.js: replace structuredClone JSON body with @ungap/structured-clone
- Update polyfills/hermes.js: add Symbol.asyncIterator guard
- Update polyfills/hermes.js: add Web Streams polyfill section
- Run `yarn test:bundle` in packages/reference-app-rn to verify bundle compiles
