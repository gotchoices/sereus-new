description: Updated polyfill documentation to reflect code upgrades and added quality guidance
dependencies: 3-polyfill-code-upgrades (implemented)
files:
  - packages/reference-app-rn/README.md
  - docs/reference-app-rn.md
  - docs/cadre-architecture.md
----

## Summary

Updated polyfill documentation in both `packages/reference-app-rn/README.md` and `docs/reference-app-rn.md` to reflect the polyfill code upgrades from ticket 3, and added guidance sections to prevent future divergence.

## Changes made

### Polyfill inventory tables (both files)
- Updated `crypto.getRandomValues` notes: now references `react-native-get-random-values` (native CSPRNG) with Math.random last-resort fallback using `console.error`
- Updated `structuredClone` notes: now references `@ungap/structured-clone` (spec-compliant, handles Date/Map/Set/circular refs)
- Added `Symbol.asyncIterator` row (one-liner guard for Hermes)
- Added `ReadableStream`/`WritableStream`/`TransformStream` row (via `web-streams-polyfill`)

### Built-in APIs table (both files)
- In README: added new "Built-in APIs (no polyfill needed)" section after "Adding new polyfills"
- In docs: moved existing "Built-in" table from after Metro aliases to after "Other global polyfills"
- Enhanced with "Available since" column and version-specific notes (Hermes/Expo SDK/RN versions)

### New sections (both files)
- **Polyfill quality principles** — guidance on preferring npm packages, spec compliance, typeof guards, native module rebuild notes
- **Commonly needed beyond core** — table of polyfills apps may need beyond the core libp2p/Optimystic stack (Web Streams, Symbol.asyncIterator, URL/URLSearchParams)

### Troubleshooting (README.md)
- Updated `structuredClone` troubleshooting entry to reference `@ungap/structured-clone` instead of "JSON-based fallback"

### cadre-architecture.md
- Verified cross-reference at line ~749 — wording is generic (no references to old implementation details) and links are still valid; no changes needed

## Testing / Validation

- Verify polyfill tables in README.md and docs/reference-app-rn.md are consistent with each other
- Verify tables match actual code state in `polyfills/hermes.js` (react-native-get-random-values, @ungap/structured-clone, Symbol.asyncIterator, web-streams-polyfill)
- Verify TextEncoder/TextDecoder built-in claims are accurate for stated Hermes/Expo versions
- Check no broken markdown formatting or table alignment
- Confirm docs/cadre-architecture.md cross-reference link to `reference-app-rn.md#polyfills` resolves correctly
