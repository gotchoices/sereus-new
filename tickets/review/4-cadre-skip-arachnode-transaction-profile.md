priority: 4
description: Disable Arachnode for transaction-profile nodes to eliminate StorageMonitor, RingSelector, RestorationCoordinator, and the 60s monitoring interval from cold start
files:
  - packages/cadre-core/src/cadre-node.ts (line 281)
  - packages/cadre-core/src/strand-instance-manager.ts (lines 203-205)
----

## Summary

Changed `enableRingZulu` from unconditional `true` to `profile === 'storage'` in both places where `createLibp2pNode` is called:

1. **cadre-node.ts `createControlNode()`** — `arachnode: { enableRingZulu: this.config.profile === 'storage' }`
2. **strand-instance-manager.ts `startStrand()`** — `arachnode: { enableRingZulu: config.profile === 'storage' }`

Also removed the stale "Storage ring participation stub" comment block in strand-instance-manager.ts.

## Effect

- `profile: 'storage'` nodes — no change, Arachnode initializes as before
- `profile: 'transaction'` nodes — Arachnode skipped entirely (no StorageMonitor, RingSelector, RestorationCoordinator, no 60s setInterval)

The downstream `createLibp2pNodeBase` in optimystic already gates all Arachnode init on `enableRingZulu`, so no further changes needed.

## Testing / Validation

- All 125 cadre-core tests pass (10 test files)
- Tests default to transaction profile, confirming the `enableRingZulu: false` path works
- To verify storage-profile behavior: run a storage-profile node and check debug logs for "Arachnode" initialization messages
- Cold-start timing comparison will be possible once the timing instrumentation ticket lands
