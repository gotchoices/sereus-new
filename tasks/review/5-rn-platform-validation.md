priority: 5
description: Review RN platform validation — cadre-core exports, Metro bundle, and compatibility docs
dependencies: packages/cadre-core, packages/reference-app-rn, docs/reference-app-rn.md
----

## Summary

Validated that cadre-core, Quereus, and the MMKV storage layer are compatible with React Native / Hermes / Expo SDK 53.

### Changes Made

1. **`packages/cadre-core/package.json`** — Added `react-native` export condition (pointing to same entry point, since source is already RN-safe)

2. **`packages/reference-app-rn/package.json`** — Added `test:bundle` script that runs `expo export --platform android` as a dry-run Metro bundle to catch import resolution failures in CI

3. **`docs/reference-app-rn.md`** — Replaced speculative "Remaining Gap" section with validated findings, including polyfill inventory and bundle smoke test documentation

### Validation Results

- **Metro bundle**: 2790 modules bundled successfully. Only cosmetic warnings from `multiformats` subpath exports (file-based fallback works).
- **cadre-core**: One Node-only import (`require('path')` in `getStrandStoragePath`) — runtime-guarded, deprecated, documented.
- **Quereus**: No Node-only imports. Uses `TextEncoder` only (built-in to Hermes). Dependencies all pure JS.
- **TextDecoder**: Used by `@optimystic/db-p2p` in 3 core P2P services — covered by Expo SDK 52+ built-in global.
- **BigInt**: Supported in Hermes since RN 0.70.
- **MMKV**: `MMKVRawStorage` fully implements `IRawStorage`. Requires EAS Build for native module linkage (device testing deferred to EAS build task).

### Testing

- `yarn test:bundle` in `packages/reference-app-rn` — validates the full dependency graph resolves without errors
- MMKV device round-trip testing requires an EAS dev client build (covered by the existing `4-eas-build-ci-pipeline` task)

### Files Changed

- `packages/cadre-core/package.json`
- `packages/reference-app-rn/package.json`
- `docs/reference-app-rn.md`
