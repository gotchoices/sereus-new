priority: 5
description: RN platform validation — cadre-core exports, Metro bundle, and compatibility docs
dependencies: packages/cadre-core, packages/reference-app-rn, docs/reference-app-rn.md
----

## What Was Built

Validated and documented that cadre-core, Quereus, and the MMKV storage layer are compatible with React Native / Hermes / Expo SDK 53.

1. **`packages/cadre-core/package.json`** — Added `react-native` export condition (pointing to same entry point, since source is already RN-safe). Condition is correctly ordered before the default entries for Metro resolution.

2. **`packages/reference-app-rn/package.json`** — Added `test:bundle` script (`expo export --platform android && rm -rf dist`) as a CI-friendly dry-run Metro bundle.

3. **`docs/reference-app-rn.md`** — Replaced speculative "Remaining Gap" section with validated findings, including polyfill inventory and bundle smoke test documentation.

## Key Files

- `packages/cadre-core/package.json` — `react-native` export condition
- `packages/reference-app-rn/package.json` — `test:bundle` script
- `docs/reference-app-rn.md` — RN compatibility section (lines 145–167)
- `packages/cadre-core/src/strand-instance-manager.ts` — runtime-guarded `require('path')`
- `packages/cadre-core/src/control-database.ts` — runtime-guarded `require('fs/promises')`

## Validation Results

- **Metro bundle**: 2790 modules bundled successfully
- **cadre-core**: Two Node-only dynamic imports (`require('path')` and `require('fs/promises')`), both runtime-guarded behind `process.versions?.node`
- **Quereus**: No Node-only imports; uses `TextEncoder` only (built-in to Hermes)
- **TextDecoder**: Used by `@optimystic/db-p2p` — covered by Expo SDK 52+ built-in global
- **BigInt**: Supported in Hermes since RN 0.70
- **MMKV**: `MMKVRawStorage` implements `IRawStorage`; requires EAS Build for native module linkage

## Testing

- `yarn test` in `packages/cadre-core` — 117 tests pass, build clean
- `yarn test:bundle` in `packages/reference-app-rn` — validates the full dependency graph resolves without errors
- MMKV device round-trip testing deferred to the `4-first-eas-build` task

## Review Notes

- Fixed doc inaccuracy: cadre-core has **two** runtime-guarded Node-only imports (not one as originally stated)
- Fixed doc inaccuracy: `test:bundle` runs `expo export`, not `react-native bundle`
