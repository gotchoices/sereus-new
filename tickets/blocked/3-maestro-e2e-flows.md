priority: 3
description: Maestro E2E flows for seed application, messaging, and bidirectional sync
dependencies: 3-drone-test-fixture, 3-ci-pipeline-maestro (basic flows), packages/reference-app-rn
files: packages/reference-app-rn/maestro/
----

## Context

The CI pipeline task (`3-ci-pipeline-maestro.md`) creates basic smoke flows (app launches, navigate settings, configure drone) that don't need a live drone. This task builds on that with full E2E flows that exercise real cadre connectivity through the UI, powered by the drone test fixture and its HTTP sidecar.

These flows require the drone fixture to be running and accessible. Maestro's `runScript` command calls the sidecar HTTP API for programmatic drone-side actions.

## Test Flows

### Flow 1: Seed Application + Send Message

**File**: `maestro/seed-and-send.yaml`

```
Preconditions: drone fixture running, test-data.json available

1. App launches → Chat screen visible ("Not connected")
2. Tap Settings tab
3. Enter Party ID from test-data.json
4. Enter bootstrap addr from test-data.json
5. Tap "Connect"
6. Wait for status badge → "Connected"
7. Paste seed from test-data.json into seed input
8. Tap "Apply Seed"
9. Dismiss alert ("Seed applied")
10. Tap "Create Chat Strand"
11. Dismiss alert ("Strand created")
12. Tap Chat tab
13. Wait for status bar → "Connected · 1 strand(s)"
14. Type "Hello from Maestro" in message input
15. Tap "Send"
16. Assert: message "Hello from Maestro" visible in chat list
```

**Assertions**:
- Connection status transitions: idle → connecting → connected
- Seed application succeeds (alert text)
- Strand creation succeeds
- Message appears in chat list after send

### Flow 2: Bidirectional Sync (Drone → Phone)

**File**: `maestro/bidirectional-sync.yaml`

```
Preconditions: drone fixture running, phone connected with strand (reuse flow 1 setup or use runScript)

1. App is on Chat screen, connected with 1 strand
2. runScript: POST /message/insert to drone sidecar
   Body: { strandId: <from test-data>, memberId: "drone-test", content: "Hello from drone" }
3. Wait up to 5s (poll interval is 2s)
4. Assert: message "Hello from drone" visible in chat list
5. Assert: sender name shows "drone-test" or truncated ID
```

**Key challenge**: Maestro needs to call the HTTP sidecar. Options:

- **`runScript` (JavaScript)**: Maestro supports `runScript` with JS that can call `fetch()`. Use this to hit the sidecar's `/message/insert` endpoint.
- **`runFlow` with setup**: A sub-flow that handles connection setup, called from both flow 1 and flow 2.

### Flow 3: Round-trip Verification

**File**: `maestro/round-trip.yaml`

```
Preconditions: connected with strand

1. Send message from phone UI: "Phone says hi"
2. runScript: GET /messages/:strandId from sidecar
3. Assert via runScript: drone has received "Phone says hi"
4. runScript: POST /message/insert { content: "Drone replies" }
5. Wait for "Drone replies" to appear in phone chat list
6. Assert: both messages visible in order
```

This verifies true bidirectional replication through the full stack.

## Shared Sub-flows

### `maestro/setup/connect-to-drone.yaml`

Reusable sub-flow for connection setup:

```yaml
appId: org.gotchoices.sereus.chat
---
# Read test data (via runScript that reads test-data.json or env vars)
- runScript:
    file: scripts/read-test-data.js
    env:
      TEST_DATA_PATH: ${TEST_DATA_PATH}
    output:
      PARTY_ID: partyId
      BOOTSTRAP_ADDR: droneBootstrapAddr
      SEED: seed

# Navigate to Settings
- tapOn: "Settings"

# Enter connection details
- tapOn: "Party ID"
- inputText: ${output.PARTY_ID}
- tapOn: "Bootstrap addr"
- inputText: ${output.BOOTSTRAP_ADDR}
- tapOn: "Connect"

# Wait for connection
- assertVisible:
    text: "Connected"
    timeout: 15000

# Apply seed
- tapOn: "Paste seed"
- inputText: ${output.SEED}
- tapOn: "Apply Seed"
- tapOn: "OK"  # dismiss alert

# Create strand
- tapOn: "Create Chat Strand"
- tapOn: "OK"  # dismiss alert

# Return to Chat
- tapOn: "Chat"
- assertVisible:
    text: "1 strand"
    timeout: 5000
```

### `maestro/scripts/read-test-data.js`

```javascript
// Maestro runScript — reads test-data.json and outputs env vars
const data = JSON.parse(
  require('fs').readFileSync(
    process.env.TEST_DATA_PATH || 'test-fixture/test-data.json', 'utf8'
  )
);
output.partyId = data.partyId;
output.droneBootstrapAddr = data.droneBootstrapAddr;
output.seed = data.seed;
```

### `maestro/scripts/insert-drone-message.js`

```javascript
// Maestro runScript — inserts a message via drone sidecar
const res = await fetch(`${process.env.SIDECAR_URL || 'http://localhost:4080'}/message/insert`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    strandId: process.env.STRAND_ID,
    memberId: 'drone-test',
    content: process.env.MESSAGE_CONTENT || 'Hello from drone',
  }),
});
const result = await res.json();
output.messageId = result.message.Id;
```

## Test Accessibility

The reference app currently uses `placeholder` and `label` props but not `testID`. To make Maestro flows robust, add `testID` props to key elements:

| Element | testID | Screen |
|---------|--------|--------|
| Party ID input | `input-party-id` | Settings |
| Bootstrap addr input | `input-bootstrap-addr` | Settings |
| Connect button | `btn-connect` | Settings |
| Seed input | `input-seed` | Settings |
| Apply Seed button | `btn-apply-seed` | Settings |
| Create Strand button | `btn-create-strand` | Settings |
| Status bar | `status-bar` | Chat |
| Message input | `input-message` | Chat |
| Send button | `btn-send` | Chat |
| Message list | `message-list` | Chat |

Maestro can match by text content, but `testID` makes flows resilient to copy changes.

## TODO
- [ ] Add `testID` props to key elements in `app/index.tsx` and `app/settings.tsx`
- [ ] Create `packages/reference-app-rn/maestro/` directory structure
- [ ] Create shared sub-flow: `maestro/setup/connect-to-drone.yaml`
- [ ] Create JS helper scripts for `runScript` commands
- [ ] Write flow 1: `maestro/seed-and-send.yaml`
- [ ] Write flow 2: `maestro/bidirectional-sync.yaml`
- [ ] Write flow 3: `maestro/round-trip.yaml`
- [ ] Test all flows locally against emulator + drone fixture
- [ ] Document local Maestro test execution in docs/reference-app-rn.md
