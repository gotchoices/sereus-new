priority: 3
description: Cryptographic verification of sApp schemas on strand join
files:
  - packages/cadre-core/src/schema-verification.ts
  - packages/cadre-core/src/strand-instance-manager.ts
  - packages/cadre-core/src/index.ts
  - packages/cadre-core/test/schema-verification.spec.ts
  - packages/cadre-core/test/strand-instance-manager.spec.ts
  - packages/cadre-core/test/cadre-node.spec.ts
  - docs/architecture.md
----

## What was built

Ed25519 signature verification of sApp schemas, gating strand join in `StrandInstanceManager.startStrand()`. Before creating a libp2p node or applying schema DDL, the signature over `{schema, version}` is verified against the author's public key (`sAppConfig.id`).

## Key files

- `schema-verification.ts` — `signSchema()`, `verifySchema()`, `assertSchemaSignature()`, `SchemaVerificationError`
- `strand-instance-manager.ts` — calls `assertSchemaSignature(sAppConfig)` before any resource allocation in `startStrand()`
- `index.ts` — all four exports re-exported from package barrel

## Testing

- 11 unit tests in `schema-verification.spec.ts`: round-trip, tampered schema/version rejection, wrong key, malformed inputs, error types
- 2 integration tests in `strand-instance-manager.spec.ts`: invalid signature rejection, tampered schema rejection
- All test helpers in `strand-instance-manager.spec.ts` and `cadre-node.spec.ts` updated to use real ed25519 signatures
- 117 tests pass across 10 test files; build clean

## Review notes

- Follows the same `digest`/`sign`/`verify` pattern as `SeedBootstrapService.validateSeedSignature()`
- `assertSchemaSignature` throws before instance is added to the map — no orphaned state on failure
- `verifySchema` catches crypto errors and returns `false` (safe boolean API); `assertSchemaSignature` provides the throwing variant
- `schemaDigest` uses deterministic `JSON.stringify({ schema, version })` — consistent field order for string-only values
- Explicit checks for missing `signature` and missing `id` give better error messages than falling through to "invalid signature"
- `SchemaVerificationError` carries `sAppId` and `version` for diagnostics
- Docs updated: `architecture.md` Implementation Status now lists schema verification and correct test count (117)

## Usage

```typescript
// sApp author signs schema
import { signSchema } from '@serfab/cadre-core';
const signature = signSchema(schemaDDL, '1.0.0', authorPrivateKey);

// Application provides signed config
const sAppConfig = { id: authorPublicKey, version: '1.0.0', schema: schemaDDL, signature };

// Verification is automatic on strand join — no application code needed
```
