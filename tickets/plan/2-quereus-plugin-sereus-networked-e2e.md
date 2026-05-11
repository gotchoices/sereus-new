description: End-to-end test coverage for `quereus-plugin-sereus` running in networked mode with two in-process libp2p peers exchanging strand data, validating the multi-peer SQL round-trip.
prereq: quereus-plugin-sereus-bootstrap-e2e
files:
  - packages/quereus-plugin-sereus/src/connect.ts
  - packages/quereus-plugin-sereus/src/types.ts
  - packages/quereus-plugin-sereus/test/plugin.spec.ts
----

## Problem

Bootstrap-mode e2e (the prereq ticket) covers a single-node strand. The networked path — `transactor: 'network'`, real `createLibp2pNode`, peers discovering each other and replicating strand state — has no automated coverage in this package. Bugs in libp2p config, fret profile, coordinated-repo wiring, or strand-replication semantics surface only in the host app or under manual scale testing.

## Scope

An in-process two-peer e2e suite for `quereus-plugin-sereus`:

- Peer A is started first with `port: 0` and no bootstrap nodes; its multiaddr(s) are read from the returned libp2p node and fed to peer B via `bootstrap_nodes`.
- Both peers call `connectToStrand` with the **same** `strand_id` and the **same** `schema`, each with its own ephemeral storage path.
- Coverage:
  - **Cross-peer read-after-write:** insert via peer A, wait for replication, `select` via peer B returns the row. Use a bounded poll/timeout helper rather than fixed sleeps.
  - **Bidirectional writes:** writes from both peers converge; both peers see the same final state after replication settles.
  - **Late-joiner catch-up:** peer A inserts → peer A only at first → start peer B, which must catch up to the existing strand state.
  - **Graceful shutdown:** shutting down one peer does not corrupt the other; the surviving peer's queries continue to work.
- Suite runs under the same `e2e` test tag as the bootstrap suite so CI can opt in once.

Out of scope:

- Three-or-more-peer topology, partition/heal scenarios, adversarial peers — covered (or to be covered) under `4-scale-testing`.
- Real-network (cross-process / cross-host) testing — belongs in CI infra (`6-ci-pipeline-maestro`) or a future ticket.

## Expected behavior

A green run demonstrates that the plugin's networked composition produces a coherent multi-peer SQL surface: rows written on any peer become readable on every peer within a bounded time, late joiners catch up, and shutdown of a single peer is non-destructive to the strand.

## Open questions

- Replication-settled signal: is there a deterministic "caught up" event on the coordinated repo, or must the test poll on `select` results? This shapes the helper design and should be answered during planning rather than the test fighting timing in the dark.
- Fret profile to use under test: `edge` is the plugin default; `core` may be more appropriate for an in-process two-peer mesh. Decide and document; do not silently diverge from production defaults.

## References

- `packages/quereus-plugin-sereus/src/connect.ts` — `transactor: 'network'` branch.
- `packages/quereus-plugin-sereus/src/types.ts` — `StrandConnectionOptions`, `Libp2pNodeWithRepo`.
- Networked-mode notes in `docs/architecture.md` (Strand Lifecycle).
