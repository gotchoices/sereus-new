priority: 3
description: Drone test fixture with HTTP sidecar for automated E2E tests
dependencies: packages/cadre-cli, packages/cadre-core, packages/reference-app-rn/drone.cadre.yaml
files: packages/reference-app-rn/test-fixture/, packages/cadre-cli/src/commands/start.ts
----

## Context

Maestro UI tests need a live drone to exercise real seed application, strand creation, and bidirectional messaging. The drone must be controllable from outside the app — Maestro can only drive the phone UI, so programmatic actions (insert messages, generate seeds, query state) require an HTTP sidecar running alongside the drone process.

The existing `websocket-chat.integration.ts` proves the replication path works at the library level. This fixture bridges that to the actual app UI by providing a CLI-launchable drone with a REST API for test orchestration.

## Architecture

```
┌──────────────────────────────────────────────┐
│  drone-fixture process                       │
│                                              │
│  CadreNode (storage profile)                 │
│    ├─ Control network (WS on :4002)          │
│    └─ Strand instances (auto from watcher)   │
│                                              │
│  HTTP Sidecar (Express/Hono on :4080)        │
│    ├─ GET  /health                           │
│    ├─ GET  /status                           │
│    ├─ POST /seed/create  → encoded seed      │
│    ├─ POST /strand/create { strandId }       │
│    ├─ POST /message/insert { strandId, ... } │
│    ├─ GET  /messages/:strandId               │
│    └─ GET  /members/:strandId                │
└──────────────────────────────────────────────┘
```

### HTTP Sidecar Endpoints

| Method | Path | Body | Response | Purpose |
|--------|------|------|----------|---------|
| `GET` | `/health` | — | `{ ok: true }` | Liveness check |
| `GET` | `/status` | — | `{ peerId, strands, connected }` | Drone state |
| `POST` | `/seed/create` | — | `{ encoded: "base64url..." }` | Generate seed for phone enrollment |
| `POST` | `/strand/create` | `{ strandId? }` | `{ strandId, status }` | Create chat strand on drone |
| `POST` | `/message/insert` | `{ strandId, memberId, content }` | `{ message }` | Insert message programmatically |
| `GET` | `/messages/:strandId` | — | `{ messages: [...] }` | Query messages for assertions |
| `GET` | `/members/:strandId` | — | `{ members: [...] }` | Query members |

### Pre-generated Test Data

A startup script generates a deterministic test data file (`test-fixture/test-data.json`):

```json
{
  "partyId": "reference-chat-party",
  "droneBootstrapAddr": "/ip4/127.0.0.1/tcp/4002/ws/p2p/<drone-peer-id>",
  "seed": "<base64url-encoded seed>",
  "strandId": "<pre-created strand UUID>"
}
```

The bootstrap addr is only known after the drone starts (peer ID is generated), so the fixture script writes this file once the drone is ready.

### Startup Sequence

```bash
# Start fixture (blocks until drone + sidecar are ready)
node packages/reference-app-rn/test-fixture/start.mjs

# In CI / Maestro:
# 1. Wait for GET /health → 200
# 2. Read test-data.json for seed/bootstrap values
# 3. Run Maestro flows
```

### Implementation Approach

Build the sidecar as a lightweight module in `packages/reference-app-rn/test-fixture/`:

- `start.mjs` — Entry point: starts CadreNode + HTTP server, writes test-data.json
- `sidecar.ts` — HTTP routes using Node's built-in `http` module (no extra deps)
- `drone.fixture.yaml` — Test-specific drone config (memory storage, deterministic partyId)

Reuse `CadreNode` directly (not cadre-cli) for simpler programmatic control. Use the same chat schema from `chat-strand.ts` / `chat-operations.ts` patterns.

### Maestro Cloud Connectivity

For Maestro Cloud (cloud-hosted devices), the drone sidecar needs to be network-accessible. Options:

1. **Phase 1 (local)**: Drone on localhost, Maestro against local emulator — works today
2. **Phase 2 (CI)**: Use a tunnel (cloudflared/ngrok) to expose the drone's WS port and HTTP sidecar to Maestro Cloud devices. The CI job starts the tunnel and substitutes the public URL into test-data.json

## TODO

Phase 1 — local fixture:
- [ ] Create `packages/reference-app-rn/test-fixture/` directory
- [ ] Implement sidecar HTTP routes (`sidecar.ts`) using Node built-in `http` module
- [ ] Implement `start.mjs` entry point: CadreNode lifecycle + sidecar startup + test-data.json output
- [ ] Create `drone.fixture.yaml` with memory storage and deterministic party ID
- [ ] Write health-check wait loop for CI readiness gating
- [ ] Test manually: start fixture, paste seed into emulator, send/receive messages

Phase 2 — CI tunnel:
- [ ] Add tunnel startup to CI workflow (cloudflared or ngrok)
- [ ] Parameterize bootstrap addr in test-data.json from tunnel URL
