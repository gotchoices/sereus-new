priority: 4
description: Disable Arachnode for transaction-profile nodes to eliminate StorageMonitor, RingSelector, RestorationCoordinator, and the 60s monitoring interval from cold start
dependencies: none (optimystic already supports enableRingZulu: false)
files:
  - packages/cadre-core/src/cadre-node.ts
  - packages/cadre-core/src/strand-instance-manager.ts
  - C:/projects/optimystic/packages/db-p2p/src/libp2p-node-base.ts (reference only — no changes needed)
----

## Context

Every `createLibp2pNode` call currently passes `arachnode: { enableRingZulu: true }` regardless of node profile. For `profile: 'transaction'` (mobile/edge nodes), this creates:

- A `StorageMonitor` that reads storage stats
- A `RingSelector` with `createArachnodeInfo()` and ring determination
- A `RestorationCoordinator` with protocol registration
- A `setInterval` every 60 seconds for ring transition monitoring

None of this is useful for a transaction-only node that doesn't participate in storage rings. The optimystic `createLibp2pNodeBase` (line 368 of `libp2p-node-base.ts`) already respects `enableRingZulu: false` and skips all Arachnode initialization.

## Change

In both `createControlNode()` (`cadre-node.ts` line 271) and `startStrand()` (`strand-instance-manager.ts` line 199), conditionally set `enableRingZulu` based on the node profile:

```typescript
arachnode: {
  enableRingZulu: profile === 'storage'
}
```

This means:
- `profile: 'storage'` (servers, NAS) → Arachnode enabled, ring participation active
- `profile: 'transaction'` (phones, intermittent) → Arachnode disabled, no overhead

### cadre-node.ts createControlNode() (line 271)

Current:
```typescript
arachnode: { enableRingZulu: true },
```

Change to:
```typescript
arachnode: { enableRingZulu: this.config.profile === 'storage' },
```

### strand-instance-manager.ts startStrand() (line 199)

Current:
```typescript
arachnode: {
  enableRingZulu: true
},
```

Change to:
```typescript
arachnode: {
  enableRingZulu: config.profile === 'storage'
},
```

## Interaction with cadre architecture

This aligns with the documented design in `docs/cadre-architecture.md` under "Node Profiles":

> | Transaction | Ring Zulu only | Mobile devices | Transaction verification, caching |
> | Storage | Ring Zulu + Storage Rings | Servers, NAS | Full block storage with capacity quotas |

The doc says transaction nodes participate in "Ring Zulu only." But Ring Zulu participation doesn't require the Arachnode components (StorageMonitor, RingSelector, RestorationCoordinator) — those manage storage ring membership. Transaction nodes verify and cache transactions through the normal FRET overlay, not through Arachnode's ring system. Disabling `enableRingZulu` only disables the storage-side Arachnode machinery; FRET and gossipsub remain active.

## Tests

- Existing unit and integration tests pass (they default to transaction profile in most test configs)
- Verify that a storage-profile node still initializes Arachnode (check debug logs for "Arachnode" messages)
- After timing instrumentation lands, compare cold-start times with this change applied

## TODO

- Change `arachnode: { enableRingZulu: true }` to `arachnode: { enableRingZulu: this.config.profile === 'storage' }` in cadre-node.ts createControlNode()
- Change `arachnode: { enableRingZulu: true }` to `arachnode: { enableRingZulu: config.profile === 'storage' }` in strand-instance-manager.ts startStrand()
- Remove the "Storage ring participation stub" comment in strand-instance-manager.ts (line 201–202) since it's now properly gated by profile
- Run build and tests
