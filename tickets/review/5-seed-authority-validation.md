priority: 5
description: Seed authority validation — verify signerKey matches authority peer's publicKey
files:
  - packages/cadre-core/src/types.ts
  - packages/cadre-core/src/seed-bootstrap.ts
  - packages/cadre-core/test/seed-bootstrap.spec.ts
  - docs/cadre-architecture.md
----

## Summary

Fixed a security vulnerability in `applySeed()` where any valid ed25519 key could forge seeds. The old check only verified that *some* peer had `isAuthority: true`; the new check verifies that `signerKey` matches the `publicKey` field of an authority peer.

## Changes

1. **`SeedPeer.publicKey`** (types.ts): Added optional `publicKey?: string` field for authority peers to carry their ed25519 public key (base64url).

2. **`queryPeers()`** (seed-bootstrap.ts): Authority peer entries now include `publicKey: this.authorityPublicKey`.

3. **`applySeed()`** (seed-bootstrap.ts): Replaced `seed.peers.find(p => p.isAuthority)` with `seed.peers.some(p => p.isAuthority && p.publicKey === seed.signerKey)`. Seeds signed by non-authority keys are now rejected with error `'Signer key does not match any authority peer'`.

4. **docs/cadre-architecture.md**: Updated `SeedPeer` interface definition and Validation section to document the strengthened check.

## Test cases

5 new tests under `describe('Seed authority validation')`:
- Valid authority signer with matching publicKey — **accepted**
- Non-authority signer (signerKey doesn't match any authority peer publicKey) — **rejected**
- Authority peer with no publicKey field — **rejected**
- No authority peers in seed — **rejected**
- SeedPeer supports publicKey field — structural check

## Validation

- `yarn test` — 122 tests passing (10 files)
- `yarn build` — clean build
