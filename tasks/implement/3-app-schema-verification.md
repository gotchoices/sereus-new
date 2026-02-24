priority: 3
description: Implement cryptographic verification of sApp schemas on strand join
dependencies: packages/cadre-core, @optimystic/quereus-plugin-crypto
files:
  - packages/cadre-core/src/schema-verification.ts (new)
  - packages/cadre-core/src/strand-instance-manager.ts
  - packages/cadre-core/src/types.ts
  - packages/cadre-core/test/schema-verification.spec.ts (new)
  - packages/cadre-core/test/strand-instance-manager.spec.ts
  - packages/cadre-core/src/index.ts
----

## Overview

When joining a strand, nodes must verify the sApp schema signature to ensure it hasn't been tampered with. Currently `SAppInfo` carries `id` (author public key), `schema` (DDL), `version`, and `signature`, but the signature is never verified. This task adds cryptographic verification as a gate in `StrandInstanceManager.startStrand()`.

## Signed Data Format

Following the established pattern in `SeedBootstrapService.validateSeedSignature()` (seed-bootstrap.ts:379-404):

```typescript
// Canonical signed payload — deterministic JSON of schema + version
const payload = JSON.stringify({ schema, version });
const payloadDigest = digest(payload, 'sha256', 'utf8', 'base64url');

// Sign with author's ed25519 private key
const sig = sign(payloadDigest, authorPrivateKey, 'ed25519', 'base64url', 'base64url', 'base64url');

// Verify with author's ed25519 public key
const valid = verify(payloadDigest, sig, authorPublicKey, 'ed25519', 'base64url', 'base64url', 'base64url');
```

Both `schema` and `version` are included in the signed data to prevent cross-version replay.

## New Module: `schema-verification.ts`

Standalone functions, no class needed:

```typescript
import { digest, sign, verify } from '@optimystic/quereus-plugin-crypto';

/**
 * Sign an sApp schema with the author's private key.
 * Used by sApp authors when publishing their schema.
 */
export function signSchema(schema: string, version: string, authorPrivateKey: string): string;

/**
 * Verify an sApp schema signature against the author's public key.
 * Returns true if the signature is valid.
 */
export function verifySchema(schema: string, version: string, signature: string, authorPublicKey: string): boolean;

/**
 * Verify an SAppConfig's signature. Throws SchemaVerificationError on failure.
 * This is the gate used by StrandInstanceManager.
 */
export function assertSchemaSignature(sAppConfig: SAppConfig): void;

export class SchemaVerificationError extends Error {
  constructor(
    public readonly sAppId: string,
    public readonly version: string,
    reason: string
  ) {
    super(`sApp schema verification failed for ${sAppId} v${version}: ${reason}`);
    this.name = 'SchemaVerificationError';
  }
}
```

## Integration Point: `StrandInstanceManager.startStrand()`

In `strand-instance-manager.ts`, add verification immediately after building `sAppInfo` (line ~147), before creating the libp2p node:

```typescript
// After line 147 (sAppInfo construction), before line 162 (try block for libp2p):
assertSchemaSignature(sAppConfig);
log('Strand %s sApp schema signature verified (author: %s)', strandId, sAppConfig.id);
```

On failure, `assertSchemaSignature` throws `SchemaVerificationError`, which the existing catch block (line 221) handles — setting `instance.status = 'error'` and re-throwing.

## Trust Model

**Phase 1 (this task):** Cryptographic verification only. The application provides `SAppConfig` with the author's public key. Verification confirms the signature is valid for that key+schema+version. The application developer is responsible for providing the correct author key — this matches the current architecture where the app configures its own schema.

**Future phases (not this task):**
- TOFU: Record author key on first use per strand, reject key changes without user confirmation
- Pinning: Allow CadreNodeConfig to specify trusted author keys per sAppId
- These would be layered on top via an optional trust policy interface

## Test Plan

### `schema-verification.spec.ts` (new)

- `signSchema` produces a valid signature that `verifySchema` accepts
- `verifySchema` rejects a tampered schema (modified DDL)
- `verifySchema` rejects a tampered version (version mismatch)
- `verifySchema` rejects a signature from a different key
- `verifySchema` returns false for malformed signatures (doesn't throw)
- `assertSchemaSignature` throws `SchemaVerificationError` on invalid signature
- `assertSchemaSignature` does not throw on valid signature
- Round-trip: sign with private key, derive public key, verify

### `strand-instance-manager.spec.ts` (updates)

- Update `createSAppConfig` helper to produce real signed configs using `signSchema`
- Add test: startStrand rejects config with invalid signature
- Add test: startStrand succeeds with valid signature
- Existing tests continue to pass (they'll use the updated helper with real signatures)

## Exports

Add to `packages/cadre-core/src/index.ts`:
- `signSchema`, `verifySchema`, `assertSchemaSignature`, `SchemaVerificationError`

## TODO
- [ ] Create `schema-verification.ts` with `signSchema`, `verifySchema`, `assertSchemaSignature`, `SchemaVerificationError`
- [ ] Integrate `assertSchemaSignature` into `StrandInstanceManager.startStrand()`
- [ ] Create `schema-verification.spec.ts` with unit tests
- [ ] Update `strand-instance-manager.spec.ts` — real signatures in helpers + rejection test
- [ ] Export from `index.ts`
- [ ] Ensure build and all tests pass
