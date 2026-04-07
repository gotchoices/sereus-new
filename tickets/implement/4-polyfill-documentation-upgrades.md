description: Update polyfill documentation to reflect upgrades and add quality guidance
dependencies: 3-polyfill-code-upgrades (should be implemented first or concurrently)
files:
  - packages/reference-app-rn/README.md
  - docs/reference-app-rn.md
  - docs/cadre-architecture.md
----

## Context

The polyfill documentation in the reference app README and main docs accurately describes the *current* state but doesn't guide implementation quality. Downstream apps (like sereus-health) independently re-implemented polyfills with better packages because the docs didn't flag the existing ones as weak or recommend alternatives. After the code upgrades in ticket `3-polyfill-code-upgrades`, the docs need to reflect the new state and add guidance to prevent future divergence.

## Changes needed

### 1. Update polyfill inventory tables (README.md and docs/reference-app-rn.md)

Both files have nearly identical polyfill inventory tables. Update the Notes column for changed polyfills:

| Polyfill | Old notes | New notes |
|----------|-----------|-----------|
| `crypto.getRandomValues()` | "Math.random fallback with console warning" | "via `react-native-get-random-values` (native CSPRNG); Math.random last-resort fallback with console.error" |
| `structuredClone()` | "JSON round-trip implementation" | "via `@ungap/structured-clone` (spec-compliant); handles Date, Map, Set, circular refs" |

Add new rows:

| Polyfill | Required by | Notes |
|----------|-------------|-------|
| `Symbol.asyncIterator` | `for await...of` on custom iterables | One-liner guard; some Hermes versions omit this |
| `ReadableStream`, `WritableStream`, `TransformStream` | Vercel AI SDK, streaming libraries | via `web-streams-polyfill` |

### 2. Make "Built-in (no polyfill needed)" table more prominent

In both README.md and docs/reference-app-rn.md, the "Built-in (no polyfill needed)" table appears at the bottom of the polyfill section. Move it **above** or immediately **after** the polyfill inventory table, with a brief intro paragraph like:

> **Built-in APIs (no polyfill needed)**
>
> These APIs are natively available in the target Hermes/Expo versions used by this app. Do not add polyfills for them — it wastes bundle size and can cause subtle conflicts.

Add minimum version information:

| API | Available since | Notes |
|-----|----------------|-------|
| `TextEncoder` | Hermes (all versions used by Expo SDK 49+) | No polyfill needed; `fast-text-encoding` is unnecessary |
| `TextDecoder` | Expo SDK 52+ (UTF-8 only) | If you need non-UTF-8 encodings, use `text-encoding` package |
| `BigInt` | Hermes since RN 0.70 | |
| `crypto.getRandomValues` | RN 0.76+ with New Architecture | `react-native-get-random-values` still recommended as safety net |

### 3. Add "Polyfill quality principles" note

Add a brief section after the inventory table:

> **Polyfill quality principles**
>
> - Prefer battle-tested npm packages over hand-rolled shims (e.g., `@ungap/structured-clone` over `JSON.parse(JSON.stringify(...))`)
> - Prefer spec-compliant implementations — shortcuts like JSON round-trips silently drop data types
> - Always guard with `typeof` checks so polyfills are skipped on platforms with native support
> - Native modules (like `react-native-get-random-values`) require a dev client rebuild — document this when adding them

### 4. Add "Commonly needed beyond core" section

After the main polyfill inventory and "Adding new polyfills" section, add:

> **Commonly needed beyond core**
>
> The polyfills above cover the libp2p/Optimystic stack. Apps building additional features may need:
>
> | API | Package | When needed |
> |-----|---------|-------------|
> | Web Streams (`ReadableStream`, etc.) | `web-streams-polyfill` | Vercel AI SDK, streaming HTTP responses, any `ReadableStream`-based API |
> | `Symbol.asyncIterator` | (inline, see hermes.js) | Custom async iterables, some streaming libraries |
> | `URL` / `URLSearchParams` | `react-native-url-polyfill` | If using URL constructor in app code (Hermes has partial support) |

### 5. Update docs/cadre-architecture.md reference

The React Native Polyfills section (line ~747) is a brief pointer to the reference app docs. No structural change needed — just ensure the cross-reference text still makes sense after the doc updates. If any wording references "Math.random fallback" or "JSON round-trip", update it.

### 6. Update troubleshooting section (README.md)

The troubleshooting entry for `structuredClone` currently says "The polyfills/hermes.js shim provides a JSON-based fallback." Update to mention `@ungap/structured-clone`.

## Testing

- Review all changed docs for accuracy against the actual code state
- Verify no broken markdown links or formatting
- Ensure the polyfill tables in README.md and docs/reference-app-rn.md are consistent with each other
- Verify TextEncoder/TextDecoder built-in claims are accurate for the stated versions

## TODO

- Update polyfill inventory table in packages/reference-app-rn/README.md
- Update polyfill inventory table in docs/reference-app-rn.md
- Move and enhance "Built-in (no polyfill needed)" table in both files
- Add "Polyfill quality principles" note to both files
- Add "Commonly needed beyond core" section to both files
- Update troubleshooting section in README.md
- Verify docs/cadre-architecture.md React Native Polyfills cross-reference is still accurate
