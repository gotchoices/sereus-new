priority: 4
description: Wire CadreNodeConfig.privateKey through to createLibp2pNode so cadre peer identity persists across restarts
files:
  - packages/cadre-core/src/types.ts
  - packages/cadre-core/src/cadre-node.ts
  - packages/cadre-core/src/strand-instance-manager.ts
  - packages/cadre-core/test/cadre-node.spec.ts
  - packages/reference-app-rn/src/cadre-phone.ts
  - docs/reference-app-rn.md
----

## What was built

`CadreNodeConfig.privateKey` (typed as `PrivateKey` from `@libp2p/interface`) is now forwarded to `createLibp2pNode` in both the control node and all strand networks, so a cadre node produces the same PeerId across restarts when given the same key.

- `createControlNode()` spreads `privateKey` into its libp2p options.
- `StartStrandConfig` accepts `privateKey?: PrivateKey`; both `handleStrandAdded` and `addStrand` pass it through.
- Reference app (`cadre-phone.ts`) persists an Ed25519 keypair in MMKV via `loadOrCreatePhoneKey()`.
- Docs updated with "Peer Identity Persistence" section in `reference-app-rn.md`.

## Testing

Two tests in `cadre-node.spec.ts` under `describe('peer identity persistence')`:

- **Same key → same PeerId**: Creates two CadreNode instances with the same `PrivateKey`, verifies identical `peerId.toString()`.
- **No key → different PeerIds**: Creates two CadreNodes without `privateKey`, verifies different PeerIds (regression guard).

All 127 tests pass. Type check passes with zero errors.

## Review notes

- MMKV is not secure storage — acceptable for v1; migration to Keychain/Keystore tracked in `tickets/plan/mobile-optimizations.md`.
- Single identity shared across control + strand networks is by design (one-key-per-device architecture).
- `CreatePeerResult.privateKey` stays `Uint8Array` (out of scope).
