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

## Summary

`CadreNodeConfig.privateKey` was accepted but never forwarded to `createLibp2pNode`, so every restart generated a new random peer identity. Now:

1. **Type change**: `CadreNodeConfig.privateKey` is `PrivateKey` (from `@libp2p/interface`) instead of `Uint8Array`. Consumers serialize with `privateKeyToProtobuf`/`privateKeyFromProtobuf` from `@libp2p/crypto/keys`. `CreatePeerResult.privateKey` stays `Uint8Array` (protobuf bytes for storage).

2. **Control node**: `createControlNode()` spreads `privateKey` into `nodeOptions` and the outdated placeholder block is removed.

3. **Strand networks**: `StartStrandConfig` accepts `privateKey?: PrivateKey`, which `startStrand()` spreads into its `createLibp2pNode` call. Both call sites in `cadre-node.ts` (`handleStrandAdded` and `addStrand`) pass `this.config.privateKey`.

4. **Reference app**: `cadre-phone.ts` has `loadOrCreatePhoneKey()` that persists an Ed25519 keypair in MMKV (protobuf bytes). The key is passed as `CadreNodeConfig.privateKey` in `startPhoneNode()`.

5. **Docs**: `reference-app-rn.md` has a new "Peer Identity Persistence" section.

## Test cases

- **Same key → same PeerId**: Start/stop a CadreNode twice with the same `PrivateKey`, assert both produce identical `peerId.toString()`.
- **No key → different PeerIds**: Start/stop two CadreNodes without `privateKey`, assert different `peerId.toString()` values (regression guard).

Both tests are in `cadre-node.spec.ts` under `describe('peer identity persistence')`.

## Validation notes

- Type check passes (`tsc --noEmit`)
- All 125 tests pass (`vitest run`)
- MMKV is not secure storage — acceptable for v1; secure storage is tracked in `tickets/plan/2-mobile-optimizations.md`
- `CreatePeerResult.privateKey` stays `Uint8Array` (out of scope, different interface)
- `registerSelf()` and per-strand identity are out of scope
