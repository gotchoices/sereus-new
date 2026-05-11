description: Networked-mode e2e suite for `quereus-plugin-sereus` — two in-process libp2p peers exchanging strand data over a real `createLibp2pNode` mesh. Covers cross-peer replication, bidirectional convergence, late-joiner catch-up, and post-shutdown read survival. Complements the bootstrap-mode suite landed in `1-quereus-plugin-sereus-bootstrap-e2e`.
files:
  - packages/quereus-plugin-sereus/test/e2e/networked.e2e.spec.ts (new)
  - packages/quereus-plugin-sereus/README.md (Development section)
----

## What shipped

`test/e2e/networked.e2e.spec.ts` stands up two in-process libp2p peers via the workspace's real `createLibp2pNode` from `@optimystic/db-p2p`, attaches each to its own `Database` through `connectToStrand(..., { libp2pNode, coordinatedRepo })`, and asserts SQL state converges across the pair. The spec reuses the existing `e2e` Vitest project (`vitest.config.ts` — 60s `testTimeout`, `test/e2e/**/*.spec.ts`) — no new build/test scripts.

### Cases (4 assertions + 1 `.todo`)

- **Single-insert replication** — peer A inserts; peer B converges to `count(*) ≥ 1`; row equality asserted.
- **Bidirectional convergence** — A inserts `(1,'a')`, B inserts `(2,'b')`; both peers converge on the same 2-row set.
- **Late-joiner catch-up** — A starts alone, inserts 3 rows, then B joins; B's wait gate is `count(*) === 3`. Confirms catch-up of pre-existing strand state, not just live writes.
- **Post-shutdown reads** — peer A keeps serving local-repo reads after peer B tears down (no quorum on read path).
- `.todo` — **post-shutdown writes on the surviving peer**. Plain-language explanation lives in the spec: `consensusConfig.minAbsoluteClusterSize` is hardcoded to `2` in `db-p2p/libp2p-node-base.ts:314`, so once B is gone the commit returns "Failed to get super-majority: 1/2 approvals". Recovery would require the 60s `partitionDetectionWindow` + cluster downsize, or a different topology — out of scope here, deferred to `4-scale-testing`.

### Helper design (kept in-file)

- **`waitUntil` / `selectAll`** — inlined rather than depended on `@serfab/integration-tests`. Same 100ms/10s defaults as `integration-tests/src/harness/wait-utils.ts`; avoids creating a cycle between the plugin and the integration-tests package. Bootstrap spec doesn't use these helpers, so a single consumer doesn't justify a sibling `_helpers.ts`.
- **`startPeer(strandId, schema, bootstrapNodes, storageDir)`** — single point of peer construction: creates `FileRawStorage`, calls `createLibp2pNode({ port: 0, fretProfile: 'edge', clusterSize: 3, clusterPolicy: { allowDownsize: true, sizeTolerance: 0.5 }, ... })` (production-parity with `cadre-node.ts:272-285`), unwraps `coordinatedRepo` off the returned node, and hands the resulting `(libp2pNode, coordinatedRepo)` pair to `connectToStrand`.
- **`pickLocalAddr(node)`** — selects a `/ip4/127.0.0.1/tcp/.../p2p/...` multiaddr for peer B's bootstrap list (fallback to first usable `/tcp/.../p2p/...`). Pattern lifted from `optimystic/db-p2p/test/real-libp2p.integration.spec.ts:62`.
- **Connectivity gate** — every test that brings up B does `await waitUntil(() => peerB!.node.getConnections().length >= 1, ...)` before asserting on replication. Distinguishes "didn't replicate" from "didn't connect" on timeout.
- **`safeRm`** — retries `fs.rm` once with a 50ms gap to absorb the Windows libp2p socket linger pattern documented in the bootstrap-suite ticket.
- **Teardown order** — `afterEach` tears down peer B before peer A so B's socket releases before A is stopped; errors in shutdown/close/stop are `console.error`'d (never thrown) so tmpdir cleanup always proceeds.

### Cluster sizing rationale

`clusterSize: 3` with `clusterPolicy: { allowDownsize: true, sizeTolerance: 0.5 }` mirrors cadre-node.ts exactly. With permissive downsize a two-peer mesh comfortably commits; tightening the policy would be an accidental narrowing of the test's blast radius vs. production.

### Docs

`README.md` `Development` section now lists both e2e specs (bootstrap + networked). `docs/architecture.md`'s strand-lifecycle section already covers networked mode at the conceptual level — no doc edit needed.

## Validation

- `yarn workspace @serfab/quereus-plugin-sereus build` → exit 0.
- `yarn workspace @serfab/quereus-plugin-sereus test:e2e` → 8 passed + 1 todo, ~17.5s (well inside the 60s `testTimeout`).
- `yarn workspace @serfab/quereus-plugin-sereus test` → 29 passed + 1 todo across 3 test files, ~21.8s.

## What is NOT covered (intentional)

- The plugin's own internal `createLibp2pNode` branch (`src/connect.ts:117-135`) is still uncovered in network mode. Bootstrap e2e exercises that branch in `'local'` transactor mode; the unit suite covers the network-mode invocation with a mock. Acceptable per the ticket's scope.
- 3+-peer topologies, partition/heal, adversarial peers — owned by `4-scale-testing`.
- Cross-process / cross-host real-network testing — owned by `6-ci-pipeline-maestro`.

## Usage

```typescript
import { Database } from '@quereus/quereus';
import { FileRawStorage } from '@optimystic/db-p2p-storage-fs';
import { createLibp2pNode } from '@optimystic/db-p2p';
import { connectToStrand } from '@serfab/quereus-plugin-sereus';

// Peer A — first to come up, no bootstrap peers.
const storageA = new FileRawStorage('./data/peerA');
const nodeA = await createLibp2pNode({
  port: 0,
  bootstrapNodes: [],
  networkName: 'strand-abc',
  fretProfile: 'edge',
  storage: storageA,
  clusterSize: 3,
  clusterPolicy: { allowDownsize: true, sizeTolerance: 0.5 },
});
const dbA = new Database();
const strandA = await connectToStrand(dbA, {
  strandId: 'abc',
  libp2pNode: nodeA,
  coordinatedRepo: (nodeA as any).coordinatedRepo,
  schema: 'table Msg (Id integer primary key, Body text not null)',
});

// Peer B — bootstraps from peer A's local multiaddr.
const bootstrapAddr = nodeA.getMultiaddrs()
  .map(ma => ma.toString())
  .find(a => a.startsWith('/ip4/127.0.0.1/tcp/') && a.includes('/p2p/'))!;
const storageB = new FileRawStorage('./data/peerB');
const nodeB = await createLibp2pNode({
  port: 0,
  bootstrapNodes: [bootstrapAddr],
  networkName: 'strand-abc',
  fretProfile: 'edge',
  storage: storageB,
  clusterSize: 3,
  clusterPolicy: { allowDownsize: true, sizeTolerance: 0.5 },
});
const dbB = new Database();
const strandB = await connectToStrand(dbB, {
  strandId: 'abc',
  libp2pNode: nodeB,
  coordinatedRepo: (nodeB as any).coordinatedRepo,
  schema: 'table Msg (Id integer primary key, Body text not null)',
});

await dbA.exec(`insert into App.Msg(Id, Body) values (1, 'hello')`);
// Replication is not event-driven on IRepo — poll on peer B until visible.

await strandB.shutdown();
await strandA.shutdown();
```

## Known follow-up (parked, not a blocker)

- Post-shutdown writes on the surviving peer require either (a) cluster downsize through partition detection (60s `partitionDetectionWindow`) or (b) a smaller `minAbsoluteClusterSize` floor in `db-p2p/libp2p-node-base.ts`. Captured as `it.todo` in the spec and routed to `4-scale-testing` for the larger-topology work.
