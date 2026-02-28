priority: 3
description: Fix deliverSeed protocol stream negotiation for cross-network libp2p v3.x nodes
dependencies: packages/cadre-core (SeedBootstrapService)
files:
  - packages/cadre-core/src/seed-bootstrap.ts
----

## Context

The `SeedBootstrapService.deliverSeed()` method sends a seed to a remote peer
via the `/sereus/seed/1.0.0` protocol using `libp2p.dialProtocol()`. In the
current libp2p v3.x configuration (via `createLibp2pNode` from db-p2p), the
protocol stream returned by `dialProtocol` arrives with `status: 'reset'` and
`writeStatus: 'closed'` when the two nodes are on different libp2p networks
(different `networkName` → different identify protocol prefixes).

## Root Cause

`createLibp2pNode` configures the identify service with a network-specific
prefix: `identify({ protocolPrefix: /optimystic/${networkName} })`. When two
nodes on different networks connect, their identify exchanges fail because
the identify protocol strings don't match. Without successful identify, the
dialer has no protocol list for the remote peer. When `dialProtocol` (or
`connection.newStream`) tries multistream-select negotiation, the stream is
reset — even though the handler IS registered on the remote.

This was confirmed by diagnostic testing: `connection.newStream(PROTO)` returns
a stream with `status: 'reset'` for cross-network nodes, despite the handler
being registered with `await libp2p.handle(PROTO, ...)`.

## Observed Behavior

- `dialProtocol(addr, SEED_PROTOCOL)` → stream returned with `status: reset`
- `stream.send(data)` → throws `StreamStateError: Cannot write to a stream that is closed`
- The handler on the receiving side IS sometimes invoked (per diagnostic logs) but the
  sender's stream is already reset

## Expected Behavior

`deliverSeed` should successfully send a seed to any peer reachable by TCP,
regardless of libp2p network namespace.

## Possible Approaches

- Register `/sereus/seed/1.0.0` as a globally-recognized protocol that works
  without identify (e.g., via a shared identify prefix or a separate identify instance)
- Use `negotiateFully: false` in `dialProtocol` options (tested; didn't help)
- Use `connection.newStream()` instead of `dialProtocol()` after explicit `dial()` (tested; same result)
- Investigate whether yamux/libp2p has a bug where streams are reset during
  protocol negotiation when identify fails
- Consider whether the seed protocol should bypass libp2p protocol negotiation
  entirely (e.g., use raw TCP with a custom handshake)

## Impact

The `applySeed` + `dial` path works correctly for enrollment (OOB seed delivery).
Only the direct protocol delivery path (`deliverSeed`) is affected. The stream
API itself (send/AsyncIterable) was fixed in the enrollment ticket.

## Notes

The `LibP2PStream` interface and read/write patterns in `seed-bootstrap.ts` were
already updated to libp2p v3.x (send() instead of sink(), AsyncIterable instead
of stream.source) as part of the E2E enrollment tests ticket. The `authorizePeer`
null multiaddr issue was also fixed (empty string instead of null for NOT NULL
CadrePeer.Multiaddr column).
