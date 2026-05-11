description: End-to-end suite for `quereus-plugin-sereus` in networked mode — two in-process libp2p peers exchanging strand data over a real `createLibp2pNode` mesh. Validates cross-peer replication, late-joiner catch-up, and graceful single-peer shutdown.
files:
  - packages/quereus-plugin-sereus/test/e2e/networked.e2e.spec.ts (new)
  - packages/quereus-plugin-sereus/test/e2e/_helpers.ts (new, optional)
  - packages/quereus-plugin-sereus/src/connect.ts (read-only reference)
  - packages/quereus-plugin-sereus/src/types.ts (read-only reference)
  - packages/quereus-plugin-sereus/test/e2e/bootstrap.e2e.spec.ts (model)
  - packages/quereus-plugin-sereus/vitest.config.ts (already has `e2e` project)
----

## What this ticket adds

A new `test/e2e/networked.e2e.spec.ts` that brings up two in-process libp2p peers, attaches each to a `Database` via `connectToStrand`, and asserts SQL state converges across the pair.

The bootstrap e2e (`tickets/complete/1-quereus-plugin-sereus-bootstrap-e2e.md`) already established:

- the `e2e` vitest project (60s `testTimeout`, `test/e2e/**/*.spec.ts`),
- `yarn test:e2e` script,
- per-test tmp-dir isolation under `os.tmpdir()/sereus-plugin-e2e/<uuid>`,
- the no-`vi.mock` discipline that lets these specs use real libp2p alongside a mocked unit suite.

This ticket reuses all of that; the only new infrastructure is one spec file and a small inline poll helper.

## Architecture

### Peer construction

`connectToStrand`'s public API surfaces the libp2p node only as an opaque resource owned by `shutdown()`. To bootstrap peer B against peer A we need A's multiaddrs, so the spec creates each libp2p node **externally** via `createLibp2pNode` from `@optimystic/db-p2p` and injects via `options.libp2pNode` + `options.coordinatedRepo`:

```
                                 connectToStrand({ libp2pNode, coordinatedRepo, schema, ... })
                                            │
  createLibp2pNode({ port: 0 })  ──▶ Libp2pNodeWithRepo ─┘   (peer A)
              │
              ▼
       getMultiaddrs() ── strings already include /p2p/<peerId>
              │
              ▼
  createLibp2pNode({ port: 0, bootstrapNodes: A.addrs }) ──▶ Libp2pNodeWithRepo ─▶ connectToStrand(...)   (peer B)
```

Tradeoff: the plugin's internal `createLibp2pNode` branch (`src/connect.ts:117-135`) is **not** exercised by this suite in network mode. The bootstrap e2e already exercises that branch (bootstrap mode resolves to `'local'` transactor but still hits the same internal node-creation path), and the unit suite covers the network-mode invocation with a mock. Network mode + real `createLibp2pNode` from inside the plugin remains uncovered after this ticket — accept and move on; a follow-up could add a one-shot "plugin creates its own node and replicates" test once the public API exposes the node, but don't grow this ticket for it.

### Replication-settled signal

There is **no deterministic synced/caught-up event** on `IRepo` or the libp2p node. The integration-tests harness (`packages/integration-tests/src/harness/wait-utils.ts`) polls with `waitUntil` at 100ms intervals and a 5–10s timeout, and that is the pattern this suite follows. Copy a minimal inline `waitUntil` into the spec (or a sibling `_helpers.ts` if the spec gets crowded) rather than taking a workspace dep on `@serfab/integration-tests` — the helper is ~20 lines and avoids a cycle.

Inline helper shape:

```ts
async function waitUntil(
  condition: () => Promise<boolean> | boolean,
  { timeoutMs = 10_000, intervalMs = 100, description = 'condition' } = {},
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await condition()) return; } catch { /* keep waiting */ }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
}

async function selectAll<T>(db: Database, sql: string): Promise<T[]> {
  const rows: T[] = [];
  for await (const row of db.eval(sql)) rows.push(row as T);
  return rows;
}
```

### Fret profile

Stick with the plugin default `'edge'` for both peers. Production callers (cadre-core `cadre-node.ts:277`, integration-tests `test-party.ts:45`) pick `'core'` only for storage-cluster backbone nodes; a two-peer participant mesh uses `'edge'`. Document this choice in a single comment at the top of the spec so a future reader doesn't second-guess it.

### Bootstrap multiaddr extraction

`nodeA.getMultiaddrs().map(ma => ma.toString())` returns strings like `/ip4/127.0.0.1/tcp/XXXXX/p2p/12D3KooW...` — the `/p2p/<peerId>` suffix is already appended; pass directly to peer B's `bootstrapNodes`. After both nodes start, gate the first replication assertion on `waitUntil(() => nodeB.getConnections().length >= 1, ...)` so a replication-timeout failure is distinguishable from a connectivity-timeout failure.

### Per-test isolation

Each test gets:

- two ephemeral tmp dirs (`peerA-<uuid>`, `peerB-<uuid>`) under `os.tmpdir()/sereus-plugin-networked-e2e/`,
- two `FileRawStorage` instances (one per peer),
- a fresh `strandId` (`randomUUID()`),
- `port: 0` on both nodes,
- the **same** `schema` string applied to both peers via `connectToStrand`.

`afterEach` runs both `shutdown()` calls (peer B first, then peer A) inside try/catch, closes both `Database`s, stops both libp2p nodes if still running, then `fs.rm` both dirs. Errors are `console.error`'d so the cleanup chain always completes.

## Test cases

1. **Cross-peer read-after-write.** Insert one row via peer A. `waitUntil` for `select count(*) ≥ 1` on peer B (10s timeout). Then assert the row body matches.

2. **Bidirectional writes converge.** Peer A inserts `(1,'a')`; peer B inserts `(2,'b')`. `waitUntil` for both peers to report `count(*) = 2`. Then assert each peer's full result set equals the other's after sorting by `Id`.

3. **Late-joiner catch-up.** Bring up peer A only; insert three rows; wait for them to be readable on A. Then bring up peer B (bootstrapped against A). `waitUntil` for peer B to see all three rows. Confirms B catches up to existing strand state, not just live writes.

4. **Single-peer shutdown is non-destructive.** Bring up both peers, write on A, observe on B, then `shutdownB()`. Confirm peer A's subsequent `select count(*)` (no waiting — A is local) returns the expected count, and a follow-up `insert` on A succeeds without throwing. (We do not assert recoverability of A's post-shutdown writes against a re-joining C — that's `4-scale-testing` territory.)

## Risks / known-unknowns to resolve during implementation

- **Quorum / replication minimums.** FRET clusters may require ≥N participants for a strand's storage to make progress. A two-peer mesh on a fresh strand is the minimum interesting case; if test 1 hangs at write-time (rather than at read-poll-time), the cause is most likely a storage-quorum mismatch and **not** a discovery problem. Tools to disambiguate:
  - Enable `DEBUG=sereus:plugin:strand,optimystic:*,libp2p:*` in the offending run.
  - Probe `nodeB.getConnections().length` *before* the first write — if it's 0, discovery, not quorum.
  - If quorum is the blocker, evaluate whether `fretProfile: 'core'` on at least one peer (or both) makes the two-peer mesh viable; if it does, document the asymmetry in the spec comment. Do **not** silently flip to `'core'` for both — that diverges from the production default the ticket explicitly called out.
- **Windows file locks during teardown.** The bootstrap suite already handles this by `console.error`-ing shutdown failures and continuing — mirror that pattern. If peer B's libp2p socket lingers on Windows, retry `fs.rm(..., { recursive: true, force: true })` once with a 50ms delay before failing the cleanup.
- **Replication-not-event-driven.** If polling proves consistently slow (e.g. >2s for a single row to replicate), call it out in a follow-up; do not paper over with longer timeouts in this ticket beyond 10s per wait. 10s is the harness default and is plenty for an in-process mesh.

## Validation

- `yarn workspace @serfab/quereus-plugin-sereus build` exits 0.
- `yarn workspace @serfab/quereus-plugin-sereus test` exits 0 (unit + e2e). The new spec adds 4 e2e tests on top of the existing 4 bootstrap tests.
- `yarn workspace @serfab/quereus-plugin-sereus test:e2e` exits 0 in <60s.
- Spot-check with `DEBUG=sereus:* yarn workspace @serfab/quereus-plugin-sereus test:e2e -- networked` that the cross-peer replication path actually runs (not silently mocked).

## Out of scope (do not grow this ticket)

- Three-or-more-peer topology, partition/heal, adversarial peers → `4-scale-testing`.
- Cross-process / cross-host real-network testing → `6-ci-pipeline-maestro`.
- Exposing the internally-created libp2p node on `SereusPluginResult` so a future variant can drive the plugin's own node-creation path. Park as a future API consideration; not needed for this suite to be useful.

## TODO

### Phase 1 — scaffolding

- Add `test/e2e/networked.e2e.spec.ts` skeleton with `describe('connectToStrand (networked e2e)')` and the same per-test tmp-dir + cleanup pattern from `bootstrap.e2e.spec.ts`.
- Inline the `waitUntil` and `selectAll` helpers at the top of the spec (or a sibling `_helpers.ts` if a second spec needs them later).
- Add a small `startPeer(strandId, schema, bootstrapNodes, storageDir)` helper inside the spec that:
  - creates `FileRawStorage(storageDir)`,
  - calls `createLibp2pNode({ port: 0, bootstrapNodes, networkName: 'strand-' + strandId, fretProfile: 'edge', storage })`,
  - reads `coordinatedRepo` off the returned node (`Libp2pNodeWithRepo`),
  - creates a `Database`,
  - calls `connectToStrand(db, { strandId, libp2pNode, coordinatedRepo, schema, fretProfile: 'edge' })`,
  - returns `{ db, node, result, storage }` for the test to drive and the `afterEach` to tear down.

### Phase 2 — cases

- **Cross-peer read-after-write** test.
- **Bidirectional writes converge** test.
- **Late-joiner catch-up** test (peer A starts alone, inserts, then peer B joins).
- **Single-peer shutdown is non-destructive** test (shut down B, keep using A).

### Phase 3 — green build

- `yarn workspace @serfab/quereus-plugin-sereus build`.
- `yarn workspace @serfab/quereus-plugin-sereus test 2>&1 | tee /tmp/sereus-plugin-test.log` — both projects green.
- If a test hangs/times out, follow the risk-disambiguation steps above (`getConnections()` probe, debug logging). Resolve or convert to `.todo` with a one-line explanation of what would unblock it; do not leave the suite red.

### Phase 4 — review handoff

- Update README.md "Development" section: one bullet noting the networked-mode e2e suite alongside bootstrap.
- No `docs/architecture.md` changes — the strand-lifecycle doc already covers networked mode conceptually.
- Move the ticket to `review/` with a distilled summary covering: cases added, helper choices made, any quorum/profile asymmetry that surfaced, and the `getConnections()` + replication-timeout boundary.
