priority: 3
description: Drone test fixture with HTTP sidecar for automated E2E tests
dependencies: packages/cadre-core, packages/reference-app-rn
files: packages/reference-app-rn/test-fixture/start.mjs, packages/reference-app-rn/test-fixture/sidecar.mjs, packages/reference-app-rn/test-fixture/drone.fixture.yaml, packages/reference-app-rn/.gitignore
----

## What was built

A CLI-launchable drone test fixture with an HTTP sidecar, enabling Maestro UI tests to programmatically control a drone process alongside the phone UI.

### Files

- `packages/reference-app-rn/test-fixture/start.mjs` — Entry point: starts CadreNode (memory storage, WS transport), creates a pre-configured chat strand, registers a drone member, starts the HTTP sidecar, writes `test-data.json`.
- `packages/reference-app-rn/test-fixture/sidecar.mjs` — HTTP REST API using Node's built-in `http` module (no extra deps). Routes for health, status, seed creation, strand/message CRUD.
- `packages/reference-app-rn/test-fixture/drone.fixture.yaml` — Reference config documenting the fixture's CadreNode settings (memory storage, WS on :4002, no hibernation).
- `packages/reference-app-rn/.gitignore` — Added `test-fixture/test-data.json` (generated at runtime).

### HTTP Sidecar Endpoints (port 4080)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness check (`{ ok: true }`) |
| `GET` | `/status` | Drone state: peerId, strands, connected |
| `POST` | `/seed/create` | Generate base64url-encoded seed for phone enrollment |
| `POST` | `/strand/create` | Create a new chat strand (optional `strandId` in body) |
| `POST` | `/message/insert` | Insert message (`strandId`, `memberId`, `content`) |
| `GET` | `/messages/:strandId` | Query messages with joined member names |
| `GET` | `/members/:strandId` | Query members |

### Usage

```bash
# Start fixture (blocks until ready)
node packages/reference-app-rn/test-fixture/start.mjs

# Override ports via env vars
DRONE_WS_PORT=4005 DRONE_HTTP_PORT=4081 node packages/reference-app-rn/test-fixture/start.mjs

# In CI / Maestro:
# 1. Wait for GET /health -> 200
# 2. Read test-fixture/test-data.json for seed/bootstrap/strandId
# 3. Run Maestro flows
```

### Test data output (`test-data.json`)

Written after drone is ready with:
- `partyId` — control network party ID
- `droneBootstrapAddr` — full multiaddr with peer ID for phone connection
- `seed` — base64url-encoded seed for phone enrollment
- `strandId` — pre-created chat strand UUID

### Testing notes

- All 7 HTTP endpoints verified manually: health, status, seed/create, strand/create, message/insert, messages/:id, members/:id
- Error cases tested: 404 for unknown routes, proper JSON error responses
- Monorepo build passes (`yarn build`)
- All 25 existing tests pass (`yarn test`)
- Fixture uses in-memory storage — each run is clean/isolated
- WS transport explicitly configured (webSockets + circuitRelayTransport) for phone connectivity

### Review checklist

- [ ] Verify sidecar routes match chat-operations.ts patterns (datetime format, ID generation)
- [ ] Verify test-data.json provides everything Maestro flows need
- [ ] Check graceful shutdown (SIGINT/SIGTERM)
- [ ] Confirm no new dependencies added (uses Node built-in `http` module)
- [ ] Ensure .gitignore excludes generated test-data.json
