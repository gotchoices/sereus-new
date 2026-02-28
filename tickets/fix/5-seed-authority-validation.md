priority: 5
description: Fix seed authority validation to verify signerKey corresponds to an authority peer
dependencies: packages/cadre-core/src/seed-bootstrap.ts, ed25519 key verification
----
The current seed validation in `applySeed()` only checks that the seed contains *some* peer with `isAuthority: true`, but does not verify that the `signerKey` corresponds to an authority peer's public key. An attacker with any valid signing key could forge seeds.

The fix should verify that `signerKey` matches the public key of a peer marked `isAuthority: true` in the seed's peer list. This tightens the trust model so only actual authority holders can produce valid seeds.

## TODO
- [ ] In `applySeed()`, after verifying the signature, check that `signerKey` matches the public key of at least one peer with `isAuthority: true`
- [ ] Add unit tests covering: valid authority signer accepted, non-authority signer rejected, missing authority peer rejected
- [ ] Update docs/cadre-architecture.md "Validation" section to reflect the strengthened check
