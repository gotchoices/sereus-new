priority: 3
description: Drone test fixture with HTTP sidecar for automated E2E tests
files: packages/reference-app-rn/test-fixture/start.mjs, packages/reference-app-rn/test-fixture/sidecar.mjs, packages/reference-app-rn/test-fixture/drone.fixture.yaml, packages/reference-app-rn/.gitignore
----

## Summary

A CLI-launchable drone test fixture for Maestro UI test orchestration. Starts a CadreNode with in-memory storage and WS transport, creates a pre-configured chat strand, and exposes an HTTP sidecar (default port 4080) for programmatic control.

## Key files

- `packages/reference-app-rn/test-fixture/start.mjs` — Entry point: starts CadreNode, creates chat strand, registers drone member, writes `test-data.json`.
- `packages/reference-app-rn/test-fixture/sidecar.mjs` — HTTP REST API (Node built-in `http`, no extra deps). Routes: health, status, seed/create, strand/create, message/insert, messages/:id, members/:id.
- `packages/reference-app-rn/test-fixture/drone.fixture.yaml` — Reference config documenting CadreNode settings.

## Usage

```bash
node packages/reference-app-rn/test-fixture/start.mjs

# Override ports
DRONE_WS_PORT=4005 DRONE_HTTP_PORT=4081 node packages/reference-app-rn/test-fixture/start.mjs
```

Output `test-data.json` contains: `partyId`, `droneBootstrapAddr`, `seed`, `strandId`.

## HTTP Sidecar Endpoints (port 4080)

| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Liveness check |
| GET | /status | Drone state |
| POST | /seed/create | Generate seed for phone enrollment |
| POST | /strand/create | Create chat strand |
| POST | /message/insert | Insert message (strandId, memberId, content) |
| GET | /messages/:strandId | Query messages with member names |
| GET | /members/:strandId | Query members |

## Review notes

- All sidecar SQL patterns (datetime format, max+1 ID generation, insert-or-ignore member registration) match `chat-operations.ts` exactly.
- No new dependencies — uses Node built-in `http` module.
- Graceful shutdown on SIGINT/SIGTERM.
- Parameterized SQL throughout (no injection).
- Schema duplication from `chat-strand.ts` is documented and justified (`.mjs` cannot import `.ts` without a build step).
- Build passes, all 25 existing tests pass.
