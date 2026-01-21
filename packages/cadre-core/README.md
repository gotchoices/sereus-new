# @sereus/cadre-core

Core library for Sereus cadre nodes—the infrastructure that enables parties to manage their personal cluster of nodes participating in distributed strand networks.

## Why Sereus Cadre Core?

In traditional distributed systems, users depend on centralized services to manage their data and identities. **Sereus** inverts this model: each user (or "party") controls their own **cadre**—a personal cluster of nodes ranging from always-on cloud servers to intermittently-connected mobile devices.

The cadre architecture provides:

- **Sovereignty**: Your data lives on your nodes, under your control
- **Resilience**: Multiple nodes means no single point of failure
- **Flexibility**: Mix cloud servers, home NAS, laptops, and phones
- **Privacy**: Cryptographic authorization without central servers

A cadre doesn't exist in isolation. Cadres participate in **strands**—shared data spaces where multiple parties collaborate. When you join a messaging app, your cadre joins that strand. When you share a document, you're creating a strand between your cadre and theirs.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Your Cadre                                  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        Control Network                              │ │
│  │            (Private Optimystic DB for cadre management)             │ │
│  │                                                                     │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │ │
│  │  │ Phone    │──│ Laptop   │──│ Cloud    │──│ NAS      │           │ │
│  │  │ (edge)   │  │ (edge)   │  │ (core)   │  │ (core)   │           │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│              ┌─────────────────────┼─────────────────────┐              │
│              ▼                     ▼                     ▼              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │ Strand A         │  │ Strand B         │  │ Strand C         │      │
│  │ (Chat App)       │  │ (Shared Docs)    │  │ (Photo Backup)   │      │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

Each `CadreNode` instance:
1. **Connects to the control network** - A private Optimystic database shared only by your nodes
2. **Watches for strand changes** - Automatically detects when you join or leave strands
3. **Manages strand instances** - Spins up isolated libp2p networks for each strand
4. **Handles peer enrollment** - Cryptographically authorizes new devices to join your cadre

## Installation

```bash
npm install @sereus/cadre-core
```

## Quick Start

```typescript
import { CadreNode } from '@sereus/cadre-core';

const node = new CadreNode({
  controlNetwork: {
    partyId: 'your-unique-party-id',
    bootstrapNodes: ['/ip4/192.168.1.100/tcp/4001/p2p/12D3KooW...']
  },
  profile: 'storage',  // 'storage' for servers, 'transaction' for mobile
  storage: {
    type: 'file',
    path: '/data/sereus',
    quotaBytes: 10 * 1024 * 1024 * 1024  // 10 GB
  }
});

// Start the node
await node.start();
console.log('Node started with Peer ID:', node.peerId?.toString());

// Listen for strand events
node.on('strand:started', ({ strandId }) => {
  console.log('Joined strand:', strandId);
});

// Check active strands
for (const [id, strand] of node.getStrands()) {
  console.log(`Strand ${id}: ${strand.status}, ${strand.connectedPeers} peers`);
}

// Graceful shutdown
await node.stop();
```

## Node Profiles

| Profile | Storage Role | Use Case | Ring Participation |
|---------|--------------|----------|-------------------|
| **transaction** | Ring Zulu only | Mobile devices, intermittent connectivity | Transaction verification, caching |
| **storage** | Ring Zulu + Storage Rings | Servers, NAS, always-on nodes | Full archival storage |

Both profiles participate in transaction consensus. The distinction is long-term storage commitment.

## Strand Filtering

Mobile apps typically shouldn't participate in all strands. Use filters to control participation:

```typescript
// Only participate in strands for a specific app
strandFilter: { mode: 'appId', appId: 'com.example.chat' }

// Only participate in one specific strand
strandFilter: { mode: 'strandId', strandId: 'strand-abc123' }

// Control network only, no strand participation
strandFilter: { mode: 'none' }

// Participate in all strands (default for servers)
strandFilter: { mode: 'all' }
```

## Enrolling New Devices

Adding a new device to your cadre uses the Seed Bootstrap API:

```typescript
// On the new device: generate identity
const enrollment = new EnrollmentService();
const { peerId, privateKey } = await enrollment.createCadrePeer();
// Store privateKey securely, send peerId + multiaddrs to authority

// On authority device: authorize the new peer and create seed
await node.authorizePeer(newDevicePeerId, newDeviceMultiaddrs);
const seed = await node.createSeed();

// Deliver seed to new device (via protocol, API, or out-of-band)
await node.deliverSeed(newDeviceMultiaddr, seed);
// Or encode for QR/link: const encoded = node.encodeSeed(seed);

// On new device: apply seed to join cadre
const result = await newNode.applySeed(seed);
```

For provider-hosted drones, use the helper:

```typescript
// Get drone info from provider API
const droneInfo = await provider.createContainer(plan);

// One call: authorize + create seed
const { seed, encodedSeed } = await node.addDrone({
  dronePeerId: droneInfo.peerId,
  droneMultiaddrs: droneInfo.multiaddrs
});

// Send to provider for drone initialization
await provider.applySeed(droneInfo.containerId, encodedSeed);
```

## API Reference

### CadreNode

The main entry point for cadre participation.

| Method | Description |
|--------|-------------|
| `start()` | Connect to control network and begin strand participation |
| `stop()` | Gracefully disconnect from all networks |
| `getStrands()` | Get all active strand instances |
| `getStrand(id)` | Get a specific strand instance |
| `addStrand(row)` | Manually add a strand (testing/direct API) |
| `removeStrand(id)` | Manually remove a strand |
| `getEnrollmentService()` | Access peer enrollment API |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `control:connected` | - | Connected to control network |
| `control:disconnected` | - | Disconnected from control network |
| `strand:started` | `{ strandId }` | Strand instance started |
| `strand:stopped` | `{ strandId }` | Strand instance stopped |
| `strand:error` | `{ strandId, error }` | Error in strand instance |

## Related Documentation

- **[Cadre Architecture](../../docs/cadre-architecture.md)** - Deep dive into the cadre system design
- **[Strand Management](../../docs/strands.md)** - How strands connect multiple cadres
- **[Schema Guide](../../docs/schema-guide.md)** - Optimystic schema definitions

## Related Packages

- **[@sereus/strand-proto](../strand-proto/)** - Strand initialization protocol
- **[@optimystic/db-core](https://github.com/gotchoices/optimystic)** - Distributed database core
- **[@optimystic/db-p2p](https://github.com/gotchoices/optimystic)** - libp2p integration for Optimystic

## License

MIT

