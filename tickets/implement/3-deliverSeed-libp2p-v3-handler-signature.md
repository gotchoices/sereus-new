priority: 3
description: Fix deliverSeed handler signature and close-write for libp2p v3.x
dependencies: packages/cadre-core (SeedBootstrapService)
files:
  - packages/cadre-core/src/seed-bootstrap.ts
  - packages/integration-tests/src/scenarios/deliver-seed-cross-network.integration.ts
----

## Root Cause (confirmed by reproducing tests)

The original hypothesis (identify prefix mismatch causing stream reset) was **wrong**.
Cross-network identify mismatch does NOT prevent `/sereus/seed/1.0.0` protocol negotiation.
Multistream-select works independently of identify — the handler IS invoked even cross-network.

The actual root cause has two parts:

### Bug 1: Handler signature mismatch

In libp2p v3.x (`@libp2p/interface` v3.1.0), the `StreamHandler` type is:
```typescript
// @libp2p/interface/src/stream-handler.ts
export interface StreamHandler {
  (stream: Stream, connection: Connection): void | Promise<void>
}
```

Two separate arguments. But `SeedBootstrapService.registerProtocolHandler()` destructures
from a **single** argument:
```typescript
this.libp2pNode.handle(SEED_PROTOCOL, async (data: unknown) => {
  const { stream, connection } = data as IncomingStreamData;
  // data IS the stream → stream=undefined, connection=undefined → handler throws
```

The handler receives the stream as first arg, connection as second arg. Destructuring
`{ stream, connection }` from the stream object yields `undefined` for both. The handler
then throws (`Cannot read property 'Symbol.asyncIterator' of undefined`), which resets
the stream. The sender sees `status: 'reset'`, `writeStatus: 'closed'`.

### Bug 2: closeWrite() doesn't exist in v3.x

In libp2p v3.x, `Stream.close()` closes the **write end only** while keeping the read
end open (confirmed by docs: "stream itself will remain readable until remote also closes").
There is no `closeWrite()` method.

The current code does:
```typescript
if (stream.closeWrite) { await stream.closeWrite(); }
```
This is always skipped (closeWrite doesn't exist). After fixing bug 1, this would cause
a deadlock: sender never signals EOF → receiver's `for await` loop never ends.

### Evidence

- Plain-to-plain baseline test ALSO fails with `status: reset` → not identify-related
- `Object.keys(handlerArg)` shows stream properties (status, writeStatus, etc.), not
  `['stream', 'connection']`
- Tests with correct `(stream, connection)` signature + `close()` pass, including
  cross-network (network-scoped sender → plain receiver)

### Key libp2p v3.x stream API reference

```typescript
// @libp2p/interface/src/message-stream.ts
interface MessageStream extends AsyncIterable<Uint8Array | Uint8ArrayList> {
  send(data: Uint8Array | Uint8ArrayList): boolean  // write data
  close(): Promise<void>  // close WRITE end (read remains open!)
  abort(err: Error): void  // close BOTH ends immediately
  // ... status, writeStatus, etc.
}

// @libp2p/interface/src/stream.ts
interface Stream extends MessageStream {
  closeRead(): Promise<void>  // close READ end
  // ... id, protocol, readStatus, writeStatus, etc.
}
```

## Fix

### seed-bootstrap.ts changes

**1. Fix handler signature** in `registerProtocolHandler()` (~line 454):

Before:
```typescript
this.libp2pNode.handle(SEED_PROTOCOL, async (data: unknown) => {
  const { stream, connection } = data as IncomingStreamData;
```

After:
```typescript
this.libp2pNode.handle(SEED_PROTOCOL, async (rawStream: unknown, rawConnection: unknown) => {
  const stream = rawStream as LibP2PStream;
  const connection = (rawConnection as { remotePeer: { toString(): string } }).remotePeer
    ? rawConnection as Connection
    : rawConnection;
  const remotePeerId = (rawConnection as Connection).remotePeer.toString();
```

Actually, simplify: since the handler only uses `connection.remotePeer`, extract directly:
```typescript
this.libp2pNode.handle(SEED_PROTOCOL, async (rawStream: unknown, rawConnection: unknown) => {
  const stream = rawStream as LibP2PStream;
  const remotePeerId = (rawConnection as Connection).remotePeer.toString();
```

**2. Fix closeWrite → close** in `deliverSeed()` (~line 334):

Before:
```typescript
if (stream.closeWrite) {
  await stream.closeWrite();
}
```

After:
```typescript
await stream.close();
```

And remove the `finally { await stream.close() }` block (write end already closed;
stream fully closes when remote closes its write end). Add error handling:
```typescript
try {
  stream.send(lengthBytes);
  stream.send(messageBytes);
  await stream.close(); // close write end, signal EOF

  // Read ack (stream still readable)
  for await (const chunk of stream) { ... }
  return ack;
} catch (err) {
  stream.abort(err instanceof Error ? err : new Error(String(err)));
  throw err;
}
```

**3. Clean up interfaces**:
- Remove `IncomingStreamData` interface (no longer needed)
- Remove `closeWrite?()` from `LibP2PStream` interface
- Consider importing `Stream` from `@libp2p/interface` directly instead of `LibP2PStream`

### Test changes

The reproducing test at `deliver-seed-cross-network.integration.ts` already contains
the correct v3.x handler patterns. Clean up the repro tests to be proper `expect().rejects`
or remove them if redundant.

## TODO

- Update handler signature in `registerProtocolHandler()` from single-arg destructuring
  to two-arg `(stream, connection)` pattern
- Replace `closeWrite()` with `close()` in `deliverSeed()`, restructure try/catch
- Remove `IncomingStreamData` interface
- Clean up `LibP2PStream` interface (remove `closeWrite?()`)
- Fix the reproducing test (response concatenation bug, proper error assertions)
- Verify all integration tests pass including cross-network delivery
- Ensure enrollment E2E tests still pass (they use applySeed path, not deliverSeed)
