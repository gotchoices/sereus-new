# Sereus P2P Chat — React Native Reference App

A minimal peer-to-peer chat app built on the Sereus cadre system. Demonstrates strand creation, cadre networking, and real-time messaging between phones and drone servers — all over libp2p with no central server.

## Architecture Overview

```
Phone (this app)                        Drone (cadre-cli)
─────────────────                       ─────────────────
CadreNode (transaction profile)  ←────→ CadreNode (storage profile)
  ├─ Control network sync                 ├─ Control network sync
  ├─ Strand instances (chat DBs)          ├─ Strand instances (persistent)
  └─ WebSocket + Circuit Relay            └─ TCP + WebSocket listener
```

The phone runs a **transaction-profile** node (lightweight, intermittent) while the drone runs a **storage-profile** node (always-on, persists data). They sync over a shared control network identified by a Party ID.

**Strands** are isolated P2P databases. Each chat strand has `Member` and `Message` tables running on Optimystic (distributed serializable transactions) with Quereus as the SQL engine.

## Prerequisites

- Node.js 22+
- Yarn (workspace-aware)
- Android SDK (for Android) or Xcode (for iOS)
- Expo dev client (`expo-dev-client`)
- The sibling `optimystic` and `quereus` repos cloned alongside `sereus`:
  ```
  projects/
  ├── sereus/       # this repo
  ├── optimystic/
  └── quereus/
  ```

## Quick Start (App First — No Drone)

You can start the app standalone, chat locally, and add a drone later.

### 1. Build workspace dependencies

From the sereus monorepo root:

```bash
yarn install
yarn build   # builds cadre-core and other workspace packages
```

### 2. Run the app

```bash
cd packages/reference-app-rn
yarn android    # or: yarn ios
yarn start --host localhost
```

For Android emulators, forward the Metro port:

```bash
adb reverse tcp:8081 tcp:8081
```

On Windows, set the Java path for Android builds:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

### 3. Start a local strand

1. In **Settings**, enter a **Party ID** (or leave blank for auto-generated) and tap **Connect** — leave Bootstrap addr empty
2. Tap **Create Chat Strand**
3. Switch to the **Chat** tab and start messaging

Messages are stored locally in MMKV. The node operates solo in "forming" mode — no network required yet.

### 4. Add a drone later

Start the drone server:

```bash
cd packages/cadre-cli
npx cadre start -c ../reference-app-rn/drone.cadre.yaml --listen-for-seeds
```

Note the **Peer ID** from the console output. Back in the app's **Settings** tab (while still connected), use **Add Peer** to dial the drone:

```
/ip4/<drone-ip>/tcp/4002/ws/p2p/<drone-peer-id>
```

The drone joins the control network and syncs your strands — no need to disconnect and reconnect.

Alternatively, you can apply a **seed** (base64url-encoded bootstrap payload) in the Seed Bootstrap section, or paste the drone address during initial connect.

## Quick Start (With Drone)

If you want the drone running from the start:

### 1. Start the drone

```bash
cd packages/cadre-cli
npx cadre start -c ../reference-app-rn/drone.cadre.yaml --listen-for-seeds
```

The drone config (`drone.cadre.yaml`) uses:
- Party ID: `reference-chat-party`
- WebSocket on port `4002` (phones can't use raw TCP)
- Circuit relay enabled (for NAT traversal)

### 2. Run the app and connect

In **Settings**:

1. **Party ID** — enter `reference-chat-party` (must match the drone config)
2. **Bootstrap addr** — enter the drone's WebSocket multiaddr:
   ```
   /ip4/<drone-ip>/tcp/4002/ws/p2p/<drone-peer-id>
   ```
   For a local emulator, use your machine's LAN IP (not `127.0.0.1`).
3. Tap **Connect**

### 3. Create a strand and chat

1. In **Settings**, tap **Create Chat Strand**
2. Switch to **Chat** — type and send

The drone automatically joins all strands (`strandFilter: all`), so it syncs immediately.

## Connecting Multiple Users

Each phone runs its own CadreNode. To chat between two phones:

1. Start the drone — it acts as the rendezvous point
2. Both phones connect to the same Party ID and drone bootstrap address (at startup or via **Add Peer** later)
3. Phone A creates a strand
4. Phone B sees the strand via control network sync and auto-joins
5. Both phones can now send and receive messages on the shared strand

## Scripts

| Script | Description |
|--------|-------------|
| `yarn start` | Start Expo dev server |
| `yarn android` | Build and run on Android |
| `yarn ios` | Build and run on iOS |
| `yarn build:dev` | EAS cloud build (development profile) |
| `yarn build:preview` | EAS cloud build (preview profile) |
| `yarn test:bundle` | Verify the Metro bundle compiles for Android |

## Project Structure

```
reference-app-rn/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         #   Tab navigator (Chat + Settings)
│   ├── index.tsx           #   Chat screen — message list & input
│   └── settings.tsx        #   Settings — connect, dial peers, create strands
├── src/
│   ├── cadre-phone.ts      #   CadreNode singleton (WebSocket + MMKV config)
│   ├── use-cadre.ts        #   React hook: node lifecycle & strand events
│   ├── use-chat.ts         #   React hook: message polling & send
│   ├── chat-strand.ts      #   Strand creation with embedded chat schema
│   └── chat-operations.ts  #   SQL helpers (insert/query members & messages)
├── polyfills/              # Hermes runtime polyfills (Intl, EventTarget, etc.)
├── drone.cadre.yaml        # Drone server config for local development
├── metro.config.js         # Bundler config (workspace symlinks + Node.js polyfills)
└── app.json                # Expo app manifest
```

## Key Concepts

**Control network** — The shared Optimystic network (keyed by Party ID) where nodes discover each other and advertise strands.

**Strand** — An isolated P2P database. The chat app creates strands of type `'o'` (open), meaning any connected node can participate.

**Transaction vs storage profile** — Transaction nodes (phones) participate in consensus but don't persist long-term; storage nodes (drones) archive everything and stay online.

**Seed** — A bootstrap payload containing peer addresses for joining an existing cadre. Paste a base64url seed in Settings to skip manual address entry.

## Drone Configuration

The included `drone.cadre.yaml` is a minimal config for local development. Key settings:

```yaml
controlNetwork:
  partyId: "reference-chat-party"    # Must match the phone's Party ID
profile: storage                      # Always-on, persists strand data
network:
  listenAddrs:
    - "/ip4/0.0.0.0/tcp/4001"        # TCP (LAN peers)
    - "/ip4/0.0.0.0/tcp/4002/ws"     # WebSocket (required for RN)
  enableRelay: true                   # Circuit relay for NAT'd phones
```

See the [cadre-cli README](../cadre-cli/README.md) for production deployment options (systemd, Docker).

## Troubleshooting

**"Connecting..." never resolves** — Check that the bootstrap addr is correct, the drone is running, and the phone can reach the drone's IP on port 4002. On Android emulators, use your host machine's LAN IP.

**No messages appearing** — Ensure both nodes share the same Party ID. Check the Metro console for strand errors. Messages poll every 2 seconds, so there's a brief delay.

**Metro bundler errors** — Run `yarn install` from the monorepo root to ensure workspace symlinks are intact. The Metro config watches `sereus/`, `optimystic/`, and `quereus/` workspaces.
