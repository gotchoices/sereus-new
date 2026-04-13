priority: 4
description: Wire CadreNodeConfig.privateKey through to createLibp2pNode so cadre peer identity persists across restarts
dependencies: none (optimystic db-p2p already accepts `privateKey?: PrivateKey` in NodeOptions)
files:
  - packages/cadre-core/src/types.ts (CadreNodeConfig.privateKey type change)
  - packages/cadre-core/src/cadre-node.ts (createControlNode wiring + startStrand call sites)
  - packages/cadre-core/src/strand-instance-manager.ts (StartStrandConfig + startStrand wiring)
  - packages/cadre-core/test/cadre-node.spec.ts (identity persistence tests)
  - packages/reference-app-rn/src/cadre-phone.ts (loadOrCreatePhoneKey + pass to config)
  - docs/reference-app-rn.md (document key persistence)
----

## Problem

`CadreNodeConfig.privateKey` is accepted but never passed to `createLibp2pNode`. Every restart generates a new random peer identity. The comment at `cadre-node.ts:276-282` says `createLibp2pNode` doesn't support `privateKey` yet — but it does now (`@optimystic/db-p2p` `NodeOptions.privateKey?: PrivateKey` at `libp2p-node-base.ts:102-110`).

Two call sites need the fix:
1. **Control network** — `cadre-node.ts:createControlNode()` builds `nodeOptions` without `privateKey`
2. **Strand networks** — `strand-instance-manager.ts:startStrand()` calls `createLibp2pNode` without `privateKey`

Both should receive the same key. Architecture confirms one-key-per-device: a cadre peer has a single identity across control network and all strands.

## Type change: `CadreNodeConfig.privateKey`

Change from `Uint8Array` to `PrivateKey` (from `@libp2p/interface`). This matches what `createLibp2pNode` expects and keeps cadre-core storage-agnostic. Consumers serialize/deserialize with `privateKeyToProtobuf` / `privateKeyFromProtobuf` from `@libp2p/crypto/keys`.

```ts
// packages/cadre-core/src/types.ts line 1 — add PrivateKey to existing import
import type { Libp2p, PeerId, PrivateKey } from '@libp2p/interface';

// line 154 — change the field type
privateKey?: PrivateKey;
```

`CreatePeerResult.privateKey` (types.ts:271) stays `Uint8Array` — it returns protobuf bytes for storage, which is the right level for that interface.

## Control node wiring (`cadre-node.ts`)

In `createControlNode()` (line 247), the `privateKey` is already destructured from `this.config` at line 248. Replace lines 262-284:

```ts
const nodeOptions: Parameters<typeof createLibp2pNode>[0] = {
  port: 0,
  bootstrapNodes: controlNetwork.bootstrapNodes,
  networkName: `control-${controlNetwork.partyId}`,
  storage: controlStorageProvider,
  fretProfile: profile === 'storage' ? 'core' : 'edge',
  relay: enableRelay,
  clusterSize: 3,
  clusterPolicy: { allowDownsize: true, sizeTolerance: 0.5 },
  arachnode: { enableRingZulu: true },
  ...(privateKey && { privateKey }),
  ...(network?.transports && { transports: network.transports }),
  ...(network?.listenAddrs && { listenAddrs: network.listenAddrs })
};

return await createLibp2pNode(nodeOptions);
```

Delete the entire placeholder block at lines 276-282 (the `if (privateKey)` with outdated comments).

## Strand wiring (`strand-instance-manager.ts`)

Add `privateKey` to `StartStrandConfig` (line 32):

```ts
import type { PrivateKey } from '@libp2p/interface';

export interface StartStrandConfig {
  strandRow: StrandRow;
  sAppConfig: SAppConfig;
  storage?: StorageConfig;
  network?: NetworkConfig;
  profile: NodeProfile;
  defaultLatencyHint: LatencyHint;
  privateKey?: PrivateKey;
}
```

In `startStrand()` at line 187, add the `privateKey` spread to the `createLibp2pNode` call:

```ts
...(config.privateKey && { privateKey: config.privateKey }),
```

Update both call sites in `cadre-node.ts` that call `strandManager.startStrand()`:

- Line 365 (`startStrandInstance` automatic start): add `privateKey: this.config.privateKey` to the config object
- Line 496 (`addStrand` manual start): add `privateKey: this.config.privateKey` to the config object

## Reference app wiring (`cadre-phone.ts`)

Add a `loadOrCreatePhoneKey()` function using MMKV (already imported and instantiated at line 26):

```ts
import { generateKeyPair } from '@libp2p/crypto/keys';
import { privateKeyToProtobuf, privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import type { PrivateKey } from '@libp2p/interface';

const PEER_KEY_STORAGE_KEY = 'sereus:peer-private-key';

async function loadOrCreatePhoneKey(): Promise<PrivateKey> {
  const stored = mmkv.getBuffer(PEER_KEY_STORAGE_KEY);
  if (stored) {
    return privateKeyFromProtobuf(stored);
  }
  const key = await generateKeyPair('Ed25519');
  mmkv.set(PEER_KEY_STORAGE_KEY, Buffer.from(privateKeyToProtobuf(key)));
  return key;
}
```

In `startPhoneNode()`, call it before building the config:

```ts
const privateKey = await loadOrCreatePhoneKey();
const config: CadreNodeConfig = {
  privateKey,
  // ... rest unchanged
};
```

Note: MMKV is not secure storage (not Keychain/Keystore). This is acceptable for v1 — secure storage is tracked in `tickets/plan/2-mobile-optimizations.md`.

## Tests (`cadre-node.spec.ts`)

### Test 1: Same key → same peer ID

```ts
it('should produce deterministic peerId when privateKey is provided', async () => {
  const key = await generateKeyPair('Ed25519');
  const config1 = createConfig();
  config1.privateKey = key;

  const node1 = new CadreNode(config1);
  await node1.start();
  const peerId1 = node1.peerId!.toString();
  await node1.stop();

  const config2 = createConfig();
  config2.privateKey = key;
  const node2 = new CadreNode(config2);
  await node2.start();
  const peerId2 = node2.peerId!.toString();
  await node2.stop();

  expect(peerId1).toBe(peerId2);
}, 60_000);
```

### Test 2: No key → different peer IDs (regression guard)

```ts
it('should produce different peerIds without privateKey', async () => {
  const node1 = new CadreNode(createConfig());
  await node1.start();
  const peerId1 = node1.peerId!.toString();
  await node1.stop();

  const node2 = new CadreNode(createConfig());
  await node2.start();
  const peerId2 = node2.peerId!.toString();
  await node2.stop();

  expect(peerId1).not.toBe(peerId2);
}, 60_000);
```

Import `generateKeyPair` from `@libp2p/crypto/keys` in the test file.

## Docs update (`docs/reference-app-rn.md`)

Add a section on peer identity persistence explaining:
- On first launch, an Ed25519 keypair is generated and stored in MMKV
- On subsequent launches, the key is loaded from MMKV, producing a stable PeerId
- MMKV is not secure storage; migration to Keychain/Keystore is a future hardening step

## Out of scope

- `registerSelf()` (cadre-node.ts:321) — becomes meaningful with stable identity, but is a separate ticket
- Secure storage (Keychain/Keystore) — tracked in `tickets/plan/2-mobile-optimizations.md`
- Per-strand identity — architecture confirms single device identity

## TODO

### Phase 1: Core type + wiring
- Change `CadreNodeConfig.privateKey` type from `Uint8Array` to `PrivateKey` in `packages/cadre-core/src/types.ts:154` (add `PrivateKey` to the `@libp2p/interface` import at line 1)
- In `cadre-node.ts:createControlNode()`, add `...(privateKey && { privateKey })` to `nodeOptions` and delete the placeholder block at lines 276-282
- Add `privateKey?: PrivateKey` to `StartStrandConfig` in `strand-instance-manager.ts:32` (add `PrivateKey` import from `@libp2p/interface`)
- In `strand-instance-manager.ts:startStrand()` line 187, add `...(config.privateKey && { privateKey: config.privateKey })` to the `createLibp2pNode` call
- In `cadre-node.ts` line 365 and line 496, add `privateKey: this.config.privateKey` to the `strandManager.startStrand()` config objects

### Phase 2: Tests
- Add `generateKeyPair` import from `@libp2p/crypto/keys` to `cadre-node.spec.ts`
- Add test: same key in → same peer ID out across two start/stop cycles
- Add test: no key in → different peer IDs out (regression guard)
- Run `yarn test` in cadre-core and confirm pass

### Phase 3: Reference app
- Add `loadOrCreatePhoneKey()` to `packages/reference-app-rn/src/cadre-phone.ts` using MMKV + `@libp2p/crypto/keys`
- Pass loaded key into `CadreNodeConfig.privateKey` in `startPhoneNode()`
- Confirm build passes: `yarn workspace @serfab/reference-app-rn build` (or tsc)

### Phase 4: Docs
- Update `docs/reference-app-rn.md` with peer identity persistence section
