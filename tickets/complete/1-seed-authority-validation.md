priority: 5
description: Seed authority validation — signerKey must match authority peer's publicKey
files:
  - packages/cadre-core/src/types.ts
  - packages/cadre-core/src/seed-bootstrap.ts
  - packages/cadre-core/test/seed-bootstrap.spec.ts
  - docs/architecture.md
----

## What was built

Fixed a security vulnerability where any valid ed25519 key could forge seeds. Previously `applySeed()` only checked that *some* peer had `isAuthority: true`; now it verifies that `signerKey` matches an authority peer's `publicKey` field.

## Key changes

- **`SeedPeer.publicKey?: string`** — optional field on authority peers carrying their ed25519 public key (base64url)
- **`queryPeers()`** — authority peer entries include `publicKey: this.authorityPublicKey`
- **`applySeed()`** — added `seed.peers.some(p => p.isAuthority && p.publicKey === seed.signerKey)` check after signature validation; rejects seeds signed by non-authority keys
- **docs/architecture.md** — updated SeedPeer interface and Validation section

## Testing

5 tests under `describe('Seed authority validation')`:
- Valid authority signer with matching publicKey — accepted
- Non-authority signer (key mismatch) — rejected
- Authority peer with no publicKey — rejected
- No authority peers in seed — rejected
- SeedPeer supports publicKey field — structural check

All 29 seed-bootstrap tests pass. Build clean.

## Usage

Seeds created via `createSeed()` automatically include `publicKey` on authority peers. Consumers of `applySeed()` get the strengthened validation transparently.
