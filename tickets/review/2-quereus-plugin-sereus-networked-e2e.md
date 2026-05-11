description: Review networked-mode e2e suite for `quereus-plugin-sereus` — two-peer libp2p mesh validating cross-peer replication, bidirectional convergence, late-joiner catch-up, and post-shutdown read survival.
files:
  - packages/quereus-plugin-sereus/test/e2e/networked.e2e.spec.ts (new)
  - packages/quereus-plugin-sereus/README.md (Development section bullet)
----

## What landed

`test/e2e/networked.e2e.spec.ts` brings up two in-process libp2p peers via the workspace's real `createLibp2pNode` from `@optimystic/db-p2p`, attaches each to a `Database` via `connectToStrand(..., { libp2pNode, coordinatedRepo })`, and asserts SQL state converges across the pair. The spec reuses the e2e Vitest project that the bootstrap ticket already established (`vitest.config.ts`'s `e2e` project, 60 s `testTimeout`, `test/e2e/**/*.spec.ts`).

### Cases (4 assertions + 1 `.todo`)

- **replicates a single insert from peer A to peer B** — peer A inserts, `waitUntil` polls peer B until it sees `count(*) ≥ 1`, then row equality is asserted.
- **bidirectional writes converge on both peers** — A inserts `(1,'a')`, B inserts `(2,'b')`, both peers converge on the same 2-row set.
- **late-joining peer catches up to existing strand state** — A starts alone, inserts 3 rows, then B joins. B's wait gate is `count(*) === 3`; confirms catch-up of pre-existing strand state, not just live writes.
- **peer A keeps serving reads after peer B shuts down** — tears B down, then asserts A still serves a complete `select` from its local repo (no quorum needed for reads).
- `.todo` — **peer A continues accepting writes after peer B shuts down**. The plain-language explanation is in the spec: `consensusConfig.minAbsoluteClusterSize` is hardcoded to `2` in `db-p2p/libp2p-node-base.ts:314`, so once B is gone the local cluster floors at 1/2 super-majority and the commit returns "Failed to get super-majority". Recovery would require partition detection + cluster downsize (60 s `partitionDetectionWindow`) or a different topology — deferred to `4-scale-testing`.

Total runtime ~15 s for the new file; full e2e project runs in ~18 s; full `yarn test` (unit + e2e) ends at 29 passed / 1 todo.

## Helper choices

- **Inline `waitUntil` and `selectAll`** rather than a workspace dep on `@serfab/integration-tests`. Same 100 ms / 10 s defaults as `integration-tests/src/harness/wait-utils.ts`. Avoids creating a cycle between the plugin and the integration-tests package.
- **`startPeer(strandId, schema, bootstrapNodes, storageDir)`** — single point of construction for each peer: creates `FileRawStorage`, calls `createLibp2pNode({ port: 0, fretProfile: 'edge', clusterSize: 3, clusterPolicy: { allowDownsize: true, sizeTolerance: 0.5 }, ... })` (matching `cadre-node.ts:272-285`), unwraps `coordinatedRepo` off the returned node, and hands the resulting `(libp2pNode, coordinatedRepo)` pair to `connectToStrand`. Returns `{ db, node, result, storage, dir }` for the test body to drive and `afterEach` to tear down.
- **`pickLocalAddr(node)`** — picks a `/ip4/127.0.0.1/tcp/.../p2p/...` multiaddr (falls back to first `/tcp/.../p2p/...`) for peer B's bootstrap list. Pattern lifted from `optimystic/db-p2p/test/real-libp2p.integration.spec.ts:62`.
- **Connectivity gate** — before the first replication assertion every test that brings up B does `await waitUntil(() => peerB.node.getConnections().length >= 1, ...)`. This means a replication-timeout failure is distinguishable from a connectivity-timeout failure, exactly as the ticket called out.
- **`safeRm`** retries `fs.rm` once with a 50 ms gap to absorb the Windows libp2p socket linger pattern the bootstrap suite warned about.
- **Teardown order** — `afterEach` tears down peer B before peer A so B's socket releases before A is stopped. Errors in shutdown/close/stop are `console.error`'d (never thrown) so cleanup always proceeds.

## Choices that diverge from the original plan

- **`clusterSize: 3` with `sizeTolerance: 0.5`** instead of the plugin's default cluster sizing. The ticket's plan didn't fix this but did say "match production defaults"; cadre-node.ts:277-280 uses exactly these values, so the spec follows. With permissive downsize a two-peer mesh comfortably commits.
- **The 4th case became a read-only assertion + `.todo`**, not the planned "post-shutdown insert succeeds." The ticket's risk section anticipated this ("FRET clusters may require ≥N participants for a strand's storage to make progress") and the floor turned out to be the hardcoded `minAbsoluteClusterSize: 2`. The `.todo` carries a one-line explanation of what would unblock it.

## What was NOT covered (per ticket scope)

- The plugin's own internal `createLibp2pNode` branch (`src/connect.ts:117-135`) is still uncovered in network mode. Bootstrap e2e exercises that branch in `'local'` transactor mode; the unit suite covers the network-mode invocation with a mock. Acceptable per the ticket's "Architecture" section.
- 3+-peer topology, partition/heal, adversarial peers → out of scope, owned by `4-scale-testing`.
- Cross-process / cross-host real-network testing → out of scope, owned by `6-ci-pipeline-maestro`.

## Validation

- `yarn workspace @serfab/quereus-plugin-sereus build` exits 0.
- `yarn workspace @serfab/quereus-plugin-sereus test` exits 0 — 29 tests pass + 1 todo, ~19 s.
- `yarn workspace @serfab/quereus-plugin-sereus test:e2e` exits 0 — 8 tests pass + 1 todo, ~18 s, well under the 60 s `testTimeout`.

## Review focus

- Confirm the inline `waitUntil` / `selectAll` helpers belong in the spec rather than a sibling `_helpers.ts` (only one e2e file uses them; a second file would justify extraction).
- Confirm the `clusterSize: 3` + `sizeTolerance: 0.5` choice is the right production-parity knob, not an accidental tightening of the test's blast radius.
- The `.todo` is the right outcome for the post-shutdown-write case; no test should be flaky-wait-then-flip on a 60 s partition detector here.
- README `Development` section now lists both e2e specs; no `docs/architecture.md` changes were needed (strand-lifecycle doc already covers networked mode).
