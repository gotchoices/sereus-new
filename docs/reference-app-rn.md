# Reference App: P2P Chat for React Native

This document describes the architecture for `packages/reference-app-rn`, a minimal but realistic peer-to-peer chat application built on the full Sereus/Optimystic stack. Its primary purpose is to exercise and validate the React Native platform path end-to-end.

## Goals

1. **Platform validation** — prove that cadre-core, db-p2p, Quereus, and the Optimystic plugin work correctly in a React Native runtime
2. **Realistic P2P scenario** — form a true 2-party cadre (phone + drone) with a shared strand running a chat sApp
3. **No local native tooling** — use EAS Build for cloud compilation; no Xcode or Android Studio required locally
4. **Automated test target** — provide a deterministic app that Maestro or Detox can drive for CI

## Architecture Overview

```
┌──────────────────────────┐        WebSocket         ┌────────────────────────┐
│   reference-app-rn       │◄═══════════════════════►│      cadre-cli         │
│   (Phone node)           │     + circuit relay      │    (Drone node)        │
│                          │                          │                        │
│  Expo / React Native     │                          │  Node.js CLI           │
│  cadre-core              │     libp2p protocols     │  cadre-core            │
│  db-p2p (RN entrypoint)  │◄──────────────────────►│  db-p2p (TCP)          │
│  db-p2p-storage-rn (MMKV)│                          │  db-p2p-storage-fs     │
│  quereus + plugins       │                          │  quereus + plugins     │
│  Chat sApp schema        │     shared strand        │  Chat sApp schema      │
└──────────────────────────┘                          └────────────────────────┘
```

Both nodes are members of the same **cadre** (party). They share a **control network** for cadre coordination and a **strand network** running the chat sApp schema. Messages inserted on either side replicate via Optimystic's P2P consensus.

## Node Topology

### The Two Nodes

| Role | Runtime | Transport | Storage | Profile |
|------|---------|-----------|---------|---------|
| **Phone** | React Native (Expo) | WebSocket + circuit relay | MMKV (`db-p2p-storage-rn`) | `transaction` |
| **Drone** | Node.js (`cadre-cli`) | TCP + WebSocket listener | File system (`db-p2p-storage-fs`) | `storage` |

The drone runs `cadre start` with a config that:
- Listens on both TCP and WebSocket (so the phone can reach it)
- Enables circuit relay (so it can relay for the phone)
- Applies the same chat sApp schema

The phone connects outbound via WebSocket to the drone's advertised address.

### Network Topology

Each party runs two isolated libp2p networks:

1. **Control network** (`control-<partyId>`) — cadre coordination, peer registry, strand table
2. **Strand network** (`strand-<strandId>`) — chat sApp data replication

Both networks run independently with their own FRET DHT, cluster coordination, and storage. The phone participates in both via WebSocket; the drone participates via TCP (with a WebSocket listener for the phone).

## Seed Bootstrap Flow

The phone is the authority (holds signing keys). The drone is a new node that needs to be bootstrapped into the cadre.

```
┌──────────┐                              ┌──────────┐
│  Phone   │                              │  Drone   │
│(authority)│                              │  (new)   │
└────┬─────┘                              └────┬─────┘
     │  1. Start drone with --listen-for-seeds │
     │         and WebSocket listener          │
     │                                         │
     │  2. Phone creates cadre (authority key)  │
     │     Phone generates seed:               │
     │       { partyId, peers, signature }     │
     │                                         │
     │  3. Seed exchanged as JSON              │
     │     (paste / deep link / file)          │
     │────────────── seed JSON ───────────────►│
     │                                         │
     │  4. Drone applies seed                  │
     │     → populates peer cache              │
     │     → dials phone (or waits)            │
     │                                         │
     │  5. Phone dials drone (outbound, NAT-safe)
     │◄════════════ control network sync ═════►│
     │                                         │
     │  6. Strand created in control DB        │
     │◄════════════ strand network sync ══════►│
     │                                         │
     │  7. Chat messages replicate both ways   │
     └─────────────────────────────────────────┘
```

For testing, the seed is a JSON data structure passed between the nodes—no QR encoding needed. The `SeedBootstrapService.encodeSeed()` / `decodeSeed()` methods handle base64url encoding for out-of-band transport, but raw JSON is sufficient.

## Transport & Connectivity

### Drone (cadre-cli) Configuration

The drone must listen on WebSocket in addition to TCP so the phone can reach it:

```yaml
network:
  listenAddrs:
    - "/ip4/0.0.0.0/tcp/4001"
    - "/ip4/0.0.0.0/tcp/4002/ws"    # WebSocket for phone
  enableRelay: true                   # Relay for NAT'd phone
```

### Phone (RN app) Configuration

The phone supplies WebSocket + circuit relay transports via `CadreNodeConfig.network`:

```typescript
network: {
  transports: [webSockets(), circuitRelayTransport()],
  listenAddrs: []  // Cannot listen in RN
}
```

### How It Connects

`cadre-core` already passes `config.network.transports` and `config.network.listenAddrs` through to `createLibp2pNode()` for both the control node and strand instances. The `@optimystic/db-p2p` package has a `react-native` export condition that Metro resolves automatically—when the RN bundler encounters `import from '@optimystic/db-p2p'`, it resolves to `rn.js` (which does not import `@libp2p/tcp`).

## Simplified Chat Schema

The production `schemas/chat.qsql` has full cryptographic signature verification on every operation. For the reference app, we use a permissionless schema that lets anyone insert/update/delete freely:

```sql
declare schema Chat {
    table Member (
        Id text primary key,
        Name text not null check (length(Name) between 1 and 100)
    );

    table Message (
        Id integer primary key,
        MemberId text not null,
        Content text not null,
        Timestamp datetime not null,
        foreign key (MemberId) references Member(Id)
    );
}
```

No signature verification, no invite flow, no authorization constraints. This keeps the reference app focused on the P2P plumbing rather than application-level crypto.

## cadre-core React Native Compatibility

### Current State

`cadre-core` imports `createLibp2pNode` from `@optimystic/db-p2p`. That package's `exports` field includes a `react-native` condition pointing to `rn.js`, so Metro automatically selects the RN-safe entrypoint (no TCP import). Transport injection in `createControlNode()` and `StrandInstanceManager` already works.

### Remaining Gap

`cadre-core` itself does not declare a `react-native` export condition in its `package.json`. While transitive resolution of `db-p2p` works via Metro, `cadre-core` may still have imports or dependencies that don't resolve cleanly in RN. Specifically:

- Verify all transitive dependencies are RN-safe (no `fs`, `net`, `path` in hot paths)
- The `ControlDatabase` and `StrandDatabase` classes use Quereus—confirm Quereus bundles cleanly under Hermes
- If issues surface, add a `react-native` export condition to `cadre-core` with an RN-specific entrypoint

This is a **validation task**, not necessarily a code change. The reference app will surface any incompatibilities.

## Package Structure

The app lives at `packages/reference-app-rn` as a workspace member. Yarn's workspace glob (`packages/*`) picks it up automatically.

```
packages/reference-app-rn/
  app.json                    # Expo config (SDK 53, custom dev client)
  package.json                # workspace:^ deps on cadre-core, db-p2p, etc.
  tsconfig.json
  metro.config.js             # Workspace symlink resolution for Metro
  eas.json                    # EAS Build profiles (development, preview)
  app/
    _layout.tsx               # Expo Router root layout
    index.tsx                 # Chat screen (message list + input)
    settings.tsx              # Bootstrap config (seed paste, drone address)
  src/
    cadre-phone.ts            # CadreNode setup: WS transports, MMKV storage, seed apply
    chat-strand.ts            # Strand lifecycle: create/join strand, load chat schema
    chat-operations.ts        # Quereus operations: insert message, query messages
    use-chat.ts               # React hook: message list, send, connection status
    use-cadre.ts              # React hook: cadre lifecycle, seed application
  schemas/
    chat-simple.qsql          # Simplified chat schema (or inline string)
```

### Key Dependencies

| Package | Source | Purpose |
|---------|--------|---------|
| `@sereus/cadre-core` | `workspace:^` | CadreNode, seed bootstrap, strand management |
| `@optimystic/db-p2p` | npm | libp2p node creation (Metro resolves RN entrypoint) |
| `@optimystic/db-p2p-storage-rn` | npm | MMKV-backed `IRawStorage` |
| `@quereus/quereus` | npm | SQL engine for sApp schema |
| `@libp2p/websockets` | npm | WebSocket transport |
| `@libp2p/circuit-relay-v2` | npm | Circuit relay transport |
| `react-native-mmkv` | npm | Native KV store (requires native compilation) |
| `expo` | npm | Framework, dev client, EAS Build |
| `expo-router` | npm | File-based routing |

### Metro Configuration

Metro needs to resolve workspace symlinks and the `react-native` export condition:

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Resolve workspace root for symlinked packages
const workspaceRoot = path.resolve(__dirname, '../..');
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
```

## Two-Node Startup Sequence

This section walks through starting the drone and phone from scratch, establishing a connection, and chatting.

### Prerequisites

- Repo cloned, `yarn install` at root
- `cadre-cli` built: `cd packages/cadre-cli && yarn build`
- Expo dev client installed on a phone or emulator (see Build & Development Workflow)

### Step 1: Start the Drone

```bash
cd packages/cadre-cli
node dist/bin/cadre.js start \
  -c ../reference-app-rn/drone.cadre.yaml \
  --listen-for-seeds \
  --ws-port 4002
```

> `--ws-port 4002` is a convenience shorthand. The example `drone.cadre.yaml` already includes `/ip4/0.0.0.0/tcp/4002/ws` in `network.listenAddrs`, so the flag is optional when using that config as-is.

On startup the console prints:

```
Starting cadre node...
✓ Connected to control network
  Party ID: reference-chat-party
  Peer ID:  12D3KooW...
✓ Seed protocol listener enabled
Cadre node running. Press Ctrl+C to stop.
```

Note the **Peer ID** -- you'll need it in the next step.

### Step 2: Construct the Drone's Bootstrap Multiaddr

Combine the drone's IP, WebSocket port, and Peer ID into a multiaddr:

```
/ip4/<DRONE_IP>/tcp/4002/ws/p2p/<DRONE_PEER_ID>
```

For local development (phone and drone on the same machine or LAN):

```
/ip4/192.168.1.42/tcp/4002/ws/p2p/12D3KooWExamplePeerId...
```

> Use the machine's LAN IP, not `127.0.0.1`, if the phone is a separate device.

### Step 3: Connect the Phone

1. Open the Expo app on the phone (or emulator)
2. Go to the **Settings** tab
3. Enter:
   - **Party ID**: `reference-chat-party` (must match `controlNetwork.partyId` in the drone config)
   - **Bootstrap addr**: the multiaddr from Step 2
4. Tap **Connect**

The phone creates a `CadreNode` with WebSocket + circuit relay transports, dials the drone, and joins the control network. The status indicator should turn green.

### Step 4: Apply a Seed (if needed)

For the first connection, both nodes start with empty peer caches. The phone's outbound dial to the drone's bootstrap address is enough to establish the initial connection. The `--listen-for-seeds` flag on the drone means it can also accept seeds delivered via the `/sereus/seed/1.0.0` protocol.

If the nodes can't discover each other automatically (e.g., after a restart with stale state), you can manually exchange a seed:

1. On the authority side, generate and encode a seed:
   ```typescript
   const seed = await cadreNode.createSeed();
   const encoded = cadreNode.encodeSeed(seed); // base64url string
   ```
2. Paste the encoded seed into the **Seed** field on the phone's Settings screen and tap **Apply Seed**
3. Or apply via the drone's CLI: `--seed <base64url-encoded-seed>`

### Step 5: Create a Strand

1. On the phone's **Settings** tab, tap **Create Strand**
2. This calls `createChatStrand(cadreNode, uuid())` which:
   - Creates a `StrandRow` with `Type: 'o'` (open)
   - Registers the simplified chat sApp schema (Member + Message tables)
   - Starts a strand-specific libp2p network (`strand-<strandId>`)
3. The drone (with `strandFilter: all`) automatically detects the new strand and joins

### Step 6: Chat

Switch to the **Chat** tab. Type a message and send. The message is:

1. Inserted into the local strand's Quereus database via `insertMessage()`
2. Replicated to the drone via Optimystic's P2P consensus
3. Visible on both nodes

Messages from the drone (if any are inserted programmatically) replicate back to the phone the same way. The chat screen polls for new messages every 2 seconds.

### Quick Reference

| Step | Command / Action |
|------|-----------------|
| Start drone | `node dist/bin/cadre.js start -c ../reference-app-rn/drone.cadre.yaml --listen-for-seeds` |
| Note Peer ID | From drone console output |
| Build multiaddr | `/ip4/<IP>/tcp/4002/ws/p2p/<PEER_ID>` |
| Connect phone | Settings → enter Party ID + bootstrap addr → Connect |
| Create strand | Settings → Create Strand |
| Chat | Chat tab → type → send |


## Build & Development Workflow

### First-Time Setup

1. `yarn install` at repo root (workspace hoists dependencies)
2. `npx eas build --profile development --platform android` (or ios) — cloud-compiles a dev client with MMKV native module
3. Install the dev client APK/IPA on a device or emulator

### Iterating

1. Start the drone: `cd packages/cadre-cli && node dist/bin/cadre.js start -c drone.yaml --listen-for-seeds`
2. Start Metro: `cd packages/reference-app-rn && npx expo start --dev-client`
3. Open on device → app loads JS from Metro → iterate on changes without rebuilding native

### When Native Rebuild Is Needed

Only when `react-native-mmkv` or another native dependency version changes. Otherwise, JS-only iteration via the dev client.

## Testing Strategy

### Phase 1: Manual Smoke Test

- Start drone, start app, paste seed, send messages, verify bidirectional replication
- Validates the full stack on a real device

### Phase 2: Scripted Integration

- Start drone as a fixture process
- Use Maestro (or Detox) flows to: launch app → enter seed → send message → assert message appears
- Maestro Cloud can run this in CI without local emulators

### Phase 3: Convergence Tests

- Extend integration tests to verify Optimystic convergence properties:
  - Concurrent inserts from both nodes resolve correctly
  - Temporary disconnection → reconnection → sync catches up
  - Strand hibernation and wake cycle works on RN

## Multi-Party Strand Topology

Phases 1–6 exercise a single cadre (one party, two nodes). The next level of realism is **cross-party strands** — two independent parties, each with their own cadre, sharing a strand.

```
  Party A cadre                          Party B cadre
┌──────────────────────┐              ┌──────────────────────┐
│  phone-A  ←WS→  drone-A  │←─ strand network ─→│  drone-B  ←WS→  phone-B  │
│  (authority)    (storage) │              │  (storage)    (authority) │
└──────────────────────┘              └──────────────────────┘
        control-A                              control-B
   (intra-cadre only)                     (intra-cadre only)
```

Each party runs its own **control network** (cadre coordination is party-private). The **strand network** is shared across both parties — all four nodes (phone-A, drone-A, drone-B, phone-B) participate in the same FRET DHT and Optimystic replication for that strand.

### Open vs Closed Strands

| Aspect | Open (`'o'`) | Closed (`'c'`) |
|--------|-------------|----------------|
| Membership | Any peer can join | Invitation required |
| Read access | Unrestricted | Members only |
| Write access | Controlled by sApp schema | Controlled by sApp schema + membership |
| Strand schema tables | Header only | Header + Invite + ConsumedInvite + Member + MemberPeer + Authority |
| Use case | Public channels, announcements | Private chats, group DMs |

### Strand Formation Flow (cross-party)

For **closed strands** (private/invited):

1. Party A creates an `OpenInvitation` containing a token, sAppId, and bootstrap addresses for A's cadre
2. Invitation is shared out-of-band (JSON paste, deep link, etc.)
3. Party B calls `formStrand(invitation)` — this dials Party A's cadre via `strand-proto`, negotiates strand creation
4. The responder (A) provisions the strand and inserts B as a member
5. Both parties' cadre nodes join the strand network and begin replication

For **open strands**:

1. Party A creates a strand with `Type = 'o'` and publishes a join token or strand ID
2. Party B joins by referencing the strand — no invitation signature flow needed
3. Both parties' cadres replicate via the shared strand network

### Orchestration for Testing

The reference app needs a way to script multi-party scenarios. The approach:

- **Phone nodes**: RN app instances (or, for CI, a headless test driver using cadre-core directly)
- **Drone nodes**: `cadre-cli start` processes with YAML configs
- **Orchestrator**: A test script (Node.js) that spawns drone processes, generates seeds, feeds invitations between parties, and asserts convergence — similar in spirit to the `TestCadreNetwork` harness in `packages/integration-tests`

---

## Phased Implementation TODOs

### Phase 1: Validate cadre-core on RN (prerequisite)

- [ ] **Audit cadre-core transitive dependencies for RN compatibility** — bundle cadre-core with Metro and verify no Node-only modules are pulled in. Check: `fs`, `net`, `path`, `crypto` (Node built-in), `child_process`. Fix any issues with Metro resolver aliases or conditional imports.
- [ ] **Verify Quereus under Hermes** — Quereus is the SQL engine; confirm it runs correctly under Hermes (RN's JS engine). Key concerns: BigInt support, `TextEncoder`/`TextDecoder` polyfills, any V8-specific paths.
- [ ] **Test MMKV storage round-trip** — create a minimal Expo app that instantiates `MMKVRawStorage`, writes, reads, and deletes. Confirms native module linkage via EAS Build.

### Phase 2: Simplified chat schema

- [x] **Create `schemas/chat-simple.qsql`** — permissionless Member + Message tables, no signature verification, no invite flow.
- [x] **Register as a test sApp in cadre-core** — embedded as `CHAT_SCHEMA` constant in `src/chat-strand.ts`; `getChatSAppConfig()` returns the sApp config with id, version, and schema.

### Phase 3: Build the reference app

- [x] **Scaffold Expo project** — `packages/reference-app-rn` with `package.json`, `app.json` (SDK 53), `tsconfig.json`, `metro.config.js` (workspace symlink resolution), `eas.json`.
- [x] **Implement `cadre-phone.ts`** — CadreNode singleton with WebSocket + circuit relay transports, MMKV storage factory (`MMKVRawStorage` per strand), transaction profile, no listen addresses.
- [x] **Implement `chat-strand.ts`** — `createChatStrand()` / `joinChatStrand()` with embedded schema. Returns `StrandConfig` for `CadreNode.addStrand()`.
- [x] **Implement `chat-operations.ts`** — parameterized Quereus queries for `insertMember`, `queryMembers`, `insertMessage`, `queryMessages`. All SQL uses `App.*` namespace and `?` placeholders.
- [x] **Implement React hooks** — `useCadre()` for node lifecycle, seed application, strand creation; `useChat()` for polling-based message list and send.
- [x] **Build UI screens** — `app/index.tsx` (chat screen with FlatList, composer, status banner), `app/settings.tsx` (connect/disconnect, seed paste, strand management), `app/_layout.tsx` (tab navigator).
- [x] **Type-check passes** — yarn install succeeds, `tsc --noEmit` exits 0 with zero errors.

### Phase 4: Drone configuration

- [x] **Create `drone.cadre.yaml` example config** — cadre-cli config with TCP + WebSocket listener, relay enabled, storage profile, file system storage.
- [x] **Document the two-node startup sequence** — step-by-step: start drone → get its multiaddr → phone creates cadre → generates seed → drone applies seed → connection established → create strand → chat.
- [x] **Add `--ws-port` convenience flag to cadre-cli** — or document manual `listenAddrs` config with `/ip4/0.0.0.0/tcp/<port>/ws`.

### Phase 5: EAS Build & CI

- [x] **Configure EAS Build** — eas.json with development (dev client) and preview (standalone) profiles.
- [ ] **First successful build** — trigger EAS Build, install on device, verify app launches and Metro connects.
- [ ] **CI pipeline** — GitHub Actions workflow: build drone, start drone, trigger Maestro Cloud test against a preview build.

### Phase 6: Automated testing

- [ ] **Maestro flow: seed + send message** — Maestro script that pastes a pre-generated seed, waits for connection, types a message, sends, verifies it appears in the list.
- [ ] **Maestro flow: bidirectional sync** — drone sends a message (via cadre-cli or test script), verify it appears on the phone.
- [ ] **Convergence stress test** — rapid concurrent inserts from both nodes, verify final message counts match.

### Phase 7: Multi-party strand workflows

Spawn a second phone/drone pair (Party B) alongside the existing Party A pair from earlier phases. Test both private and public strand formation between independent parties.

#### Setup

- [ ] **Spawn Party B cadre** — second `cadre-cli` drone process with its own config (`drone-b.yaml`), second RN app instance (or headless cadre-core driver for CI). Party B generates its own authority key and seed independently of Party A.
- [ ] **Test orchestrator script** — Node.js script that starts both drones, generates seeds for both parties, and coordinates invitation exchange. Modeled on `TestCadreNetwork` from `packages/integration-tests` but driving real processes and RN app(s).

#### Private (closed) strand workflow

- [ ] **Party A creates closed strand** — insert a strand with `Type = 'c'` into A's control network, applying the simplified chat schema.
- [ ] **Party A creates invitation** — `createOpenInvitation(sAppId, expirationMs)` produces a token + bootstrap addrs. Invitation is serialized as JSON.
- [ ] **Party B accepts invitation** — `formStrand(invitation)` dials Party A's cadre via `strand-proto`, negotiates strand creation, and B is added as a member.
- [ ] **Cross-party messaging** — Party A sends a message → verify it appears on Party B's phone/drone. Party B replies → verify it appears on Party A. Full bidirectional replication across two independent cadres.
- [ ] **Membership enforcement** — verify that an uninvited Party C cannot read or write to the closed strand.

#### Public (open) strand workflow

- [ ] **Party A creates open strand** — insert a strand with `Type = 'o'`, publish strand ID or join token.
- [ ] **Party B joins open strand** — Party B joins without an invitation signature flow. Both cadres participate in the shared strand network.
- [ ] **Open replication** — verify messages replicate between A and B. Verify that any additional party can join without authorization.

#### Cross-party convergence

- [ ] **Concurrent cross-party writes** — both parties insert messages simultaneously into the shared strand. Verify Optimystic convergence: both parties see the same final state.
- [ ] **Disconnect / reconnect** — temporarily kill one party's drone, continue writing on the other party, restart drone, verify sync catches up across the party boundary.

### Phase 8: Scale testing (en masse)

Spawn many phone/drone pairs to stress-test strand formation, replication fan-out, and convergence under load.

- [ ] **Parameterized party spawner** — script that creates N cadre pairs (drone + headless cadre-core phone), each with its own identity and seed. Configurable N (start with 5, target 20+).
- [ ] **Fan-out open strand** — one party creates an open strand, all N parties join. Each party inserts a message. Verify all N×1 messages converge on every participant. Measure time-to-convergence as a function of N.
- [ ] **Pairwise closed strands** — create closed strands between random pairs of parties. Verify invitation flow completes for each pair. Measure strand formation throughput (strands/second).
- [ ] **Multi-strand per party** — each party participates in multiple strands simultaneously (e.g., 3–5 strands each). Verify that `StrandInstanceManager` correctly manages concurrent strand networks without interference.
- [ ] **Churn test** — randomly start/stop drone processes during active replication. Verify that surviving nodes continue operating and restarted nodes catch up.
- [ ] **Metrics collection** — instrument the test orchestrator to capture: strand formation latency, message propagation latency (insert → visible on remote), peak connection count per node, memory/CPU on drones.

