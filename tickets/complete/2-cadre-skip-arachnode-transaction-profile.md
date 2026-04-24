priority: 4
description: Disable Arachnode for transaction-profile nodes to eliminate StorageMonitor, RingSelector, RestorationCoordinator, and the 60s monitoring interval from cold start
files:
  - packages/cadre-core/src/cadre-node.ts (line 281)
  - packages/cadre-core/src/strand-instance-manager.ts (lines 203-205)
  - packages/cadre-core/src/types.ts (line 360 — JSDoc updated)
  - packages/cadre-core/src/arachnode-stub.ts (stale comment removed)
  - docs/architecture.md (Node Profiles section updated)
----

## What was built

Changed `enableRingZulu` from unconditional `true` to `profile === 'storage'` in both `createLibp2pNode` call sites:

1. `cadre-node.ts createControlNode()` — `arachnode: { enableRingZulu: this.config.profile === 'storage' }`
2. `strand-instance-manager.ts startStrand()` — `arachnode: { enableRingZulu: config.profile === 'storage' }`

The downstream `createLibp2pNodeBase` in optimystic gates all Arachnode initialization (StorageMonitor, RingSelector, RestorationCoordinator, 60s interval) on the `enableRingZulu` flag, so no further changes were needed.

## Review findings (addressed)

- **Doc inconsistency fixed**: `architecture.md` Node Profiles table and Ring Zulu description updated to reflect that Arachnode is disabled for transaction-profile nodes.
- **JSDoc updated**: `ArachnodeConfig.enableRingZulu` comment changed from "all nodes participate" to "Storage-profile only."
- **Stale comment removed**: "All nodes participate in Ring Zulu" removed from `arachnode-stub.ts`.

## Testing

- All 127 cadre-core tests pass (10 test files)
- Tests default to `profile: 'transaction'`, exercising the `enableRingZulu: false` path through real `createLibp2pNode` calls
- Build passes cleanly
- Storage-profile behavior can be verified by running a storage-profile node and checking debug logs for Arachnode initialization

## Usage

No API changes. Existing configurations work as before:
- `profile: 'storage'` — full Arachnode initialization (unchanged)
- `profile: 'transaction'` — Arachnode skipped, lighter cold start
