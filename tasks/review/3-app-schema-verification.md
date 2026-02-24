priority: 3
description: Cryptographic verification of sApp schemas on strand join
files:
  - packages/cadre-core/src/schema-verification.ts
  - packages/cadre-core/src/strand-instance-manager.ts
  - packages/cadre-core/src/index.ts
  - packages/cadre-core/test/schema-verification.spec.ts
  - packages/cadre-core/test/strand-instance-manager.spec.ts
  - packages/cadre-core/test/cadre-node.spec.ts
----

## What was done

Added ed25519 signature verification of sApp schemas as a gate in `StrandInstanceManager.startStrand()`. Before creating a libp2p node or applying the schema DDL, the signature over `{schema, version}` is verified against the author's public key (`sAppConfig.id`).

## New module: `schema-verification.ts`

- `signSchema(schema, version, authorPrivateKey)` — signs a schema for publishing
- `verifySchema(schema, version, signature, authorPublicKey)` — verifies a signature (returns boolean)
- `assertSchemaSignature(sAppConfig)` — throws `SchemaVerificationError` on failure
- `SchemaVerificationError` — typed error with `sAppId` and `version` fields

Uses the same `digest`/`sign`/`verify` pattern as `SeedBootstrapService.validateSeedSignature()`, with `@optimystic/quereus-plugin-crypto` ed25519 functions.

## Integration

`StrandInstanceManager.startStrand()` now calls `assertSchemaSignature(sAppConfig)` before any resource allocation. On failure, the error propagates through the existing catch block (strand enters `error` state).

## Testing

- 11 new tests in `schema-verification.spec.ts`: round-trip signing, tampered schema/version rejection, wrong key rejection, malformed input handling, error types
- 2 new tests in `strand-instance-manager.spec.ts`: invalid signature rejection, tampered schema rejection
- Updated test helpers in `strand-instance-manager.spec.ts` and `cadre-node.spec.ts` to use real ed25519 signatures instead of fake `'test-signature'`
- All 117 tests pass

## Validation

- `yarn workspace @serfab/cadre-core build` succeeds
- `yarn workspace @serfab/cadre-core test` — 117 tests pass (10 test files)

## Usage

sApp authors sign their schema:
```typescript
import { signSchema } from '@serfab/cadre-core';
const signature = signSchema(schemaDDL, '1.0.0', authorPrivateKey);
```

Applications provide the signed config:
```typescript
const sAppConfig = { id: authorPublicKey, version: '1.0.0', schema: schemaDDL, signature };
```

Verification is automatic on strand join — no application code needed.
