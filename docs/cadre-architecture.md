# Sereus Cadre Architecture

This document describes the architecture of the Sereus Cadre system—the infrastructure that enables parties to control sets of nodes participating in distributed strand networks.

## Overview

A **cadre** is a party's personal cluster of nodes that collectively represent their presence across strands. Cadre nodes range from always-on cloud servers with terabytes of storage to intermittently-connected mobile devices. The cadre system provides:

- **Unified control**: A single control network through which a party manages all their nodes
- **Strand participation**: Automatic lifecycle management for joining, syncing, and leaving strand networks
- **Flexible deployment**: Support for self-hosted nodes, provider-hosted containers, and mobile devices
- **Key-based authorization**: Cryptographic authority delegation without central servers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Party (User)                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Control Network                               │   │
│  │  (Distributed Optimystic DB with CadreControl schema)               │   │
│  │                                                                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │   │
│  │  │ Phone    │  │ Laptop   │  │ Cloud    │  │ NAS      │            │   │
│  │  │ (edge)   │──│ (edge)   │──│ (core)   │──│ (core)   │            │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│              ┌─────────────────────┼─────────────────────┐                 │
│              ▼                     ▼                     ▼                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │ Strand A         │  │ Strand B         │  │ Strand C         │         │
│  │ (2 nodes active) │  │ (3 nodes active) │  │ (1 node active)  │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### Control Network

The control network is a private Optimystic network involving only the party's own cadre nodes. It uses the `CadreControl` schema to maintain:

| Table | Purpose |
|-------|---------|
| `AuthorityKey` | Keys authorized to make control changes |
| `ValidationKey` | Keys that can validate strand formation disclosures |
| `Strand` | List of strands the party participates in |
| `CadrePeer` | Registry of nodes in the cadre |
| `FormationInvite` | Open invitations to form strands with this party |
| `FormationUsage` | Audit log of formation invite consumption |

The control network protocol prefix is fixed: `/sereus/control/<party-id>`.

### Strand Networks

Each strand is an independent Optimystic network with its own:
- Protocol prefix: `/sereus/strand/<strand-id>`
- Member list (for closed strands)
- Application schema
- Peer cohort (union of all member cadres)

Strands use the `Strand` schema which manages membership, invites, and authority delegation.

### Cadre Node

A cadre node is a running instance of the `@sereus/cadre-core` library. Each node:

1. **Connects to the control network** using its PeerId and authorized bootstrap addresses
2. **Watches the `Strand` table** for changes (reactive pattern - which is a TODO for Optimystic so we'll have to poll for now)
3. **Starts/stops strand instances** as rows are added/removed
4. **Reports its multiaddr** back to `CadrePeer` for peer discovery

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Cadre Node Process                         │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    Control Network Instance                    │ │
│  │  libp2p + Optimystic + Quereus (CadreControl schema)          │ │
│  │                                                                │ │
│  │  ┌─────────────────┐                                          │ │
│  │  │ Strand Watcher  │──watches──▶ Strand table changes         │ │
│  │  └────────┬────────┘                                          │ │
│  └───────────┼───────────────────────────────────────────────────┘ │
│              │                                                      │
│              │ start/stop strand instances                         │
│              ▼                                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    Strand Instance Manager                     │ │
│  │                                                                │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │ │
│  │  │ Strand A    │  │ Strand B    │  │ Strand C    │           │ │
│  │  │ Instance    │  │ Instance    │  │ Instance    │           │ │
│  │  │             │  │             │  │             │           │ │
│  │  │ libp2p node │  │ libp2p node │  │ libp2p node │           │ │
│  │  │ + Optimystic│  │ + Optimystic│  │ + Optimystic│           │ │
│  │  │ + App Schema│  │ + App Schema│  │ + App Schema│           │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                      Storage Layer                             │ │
│  │  (Shared across all instances - memory, file, or LevelDB)     │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Node Profiles

Cadre nodes operate in one of two profiles, distinguished by their storage role:

| Profile | Storage Role | Typical Deployment | Ring Participation |
|---------|--------------|--------------------|--------------------|
| **Transaction** | Ring Zulu only | Mobile devices, intermittent connectivity | Transaction verification, caching |
| **Storage** | Ring Zulu + Storage Rings | Servers, NAS, always-on nodes | Full block storage with capacity quotas |

Both profiles participate equally in transaction consensus. The distinction is whether the node commits to long-term archival storage in Arachnode's concentric ring system.

### Strand Filtering

Mobile nodes typically run as part of a specific application and should not participate in all strands. The configuration includes an optional **strand filter**:

| Filter Mode | Behavior |
|-------------|----------|
| `all` | Participate in all strands in the control network (default for servers) |
| `sAppId:<id>` | Only participate in strands matching the specified sAppId |
| `strandId:<id>` | Only participate in a single specific strand |
| `none` | Control network only, no strand participation |

This allows a mobile app to embed a cadre node that only participates in the app's strand while the user's server nodes handle the full portfolio.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Arachnode Rings                             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      Ring Zulu (Transaction)                 │   │
│  │                                                              │   │
│  │   All nodes participate here regardless of profile           │   │
│  │   • Transaction verification                                 │   │
│  │   • Ephemeral caching                                        │   │
│  │   • Forward to storage rings                                 │   │
│  │                                                              │   │
│  │   ┌─────────────────────────────────────────────────────┐   │   │
│  │   │              Ring 3 (8 partitions)                   │   │   │
│  │   │                                                      │   │   │
│  │   │   ┌─────────────────────────────────────────────┐   │   │   │
│  │   │   │          Ring 2 (4 partitions)               │   │   │   │
│  │   │   │                                              │   │   │   │
│  │   │   │   ┌─────────────────────────────────────┐   │   │   │   │
│  │   │   │   │      Ring 1 (2 partitions)          │   │   │   │   │
│  │   │   │   │                                     │   │   │   │   │
│  │   │   │   │   ┌─────────────────────────────┐   │   │   │   │   │
│  │   │   │   │   │   Ring 0 (full keyspace)    │   │   │   │   │   │
│  │   │   │   │   │                             │   │   │   │   │   │
│  │   │   │   │   │   Storage profile nodes     │   │   │   │   │   │
│  │   │   │   │   │   join appropriate ring     │   │   │   │   │   │
│  │   │   │   │   │   based on capacity         │   │   │   │   │   │
│  │   │   │   │   └─────────────────────────────┘   │   │   │   │   │
│  │   │   │   └─────────────────────────────────────┘   │   │   │   │
│  │   │   └─────────────────────────────────────────────┘   │   │   │
│  │   └─────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Enrollment Flow

New cadre nodes are enrolled through a two-phase process that ensures cryptographic authorization without requiring the enrolling device to have prior network access.

### Phase 1: Peer Creation

The new node generates its libp2p identity locally:

```
┌──────────────┐                           ┌──────────────┐
│  New Node    │                           │  Authority   │
│  (Provider)  │                           │  (Phone)     │
└──────┬───────┘                           └──────┬───────┘
       │                                          │
       │  createCadrePeer()                       │
       │  ─────────────────▶                      │
       │                                          │
       │  Generate keypair locally                │
       │                                          │
       │  ◀───────────────────────────────────────│
       │  Return PeerId                           │
       │                                          │
```

### Phase 2: Registration

The authority (e.g., user's phone) signs the new peer into the control network:

```
┌──────────────┐                           ┌──────────────┐
│  New Node    │                           │  Authority   │
│  (Provider)  │                           │  (Phone)     │
└──────┬───────┘                           └──────┬───────┘
       │                                          │
       │                     registerCadrePeer(   │
       │                       peerId,            │
       │                       bootstrapNodes,    │
       │                       authorityKey,      │
       │                       signature          │
       │                     )                    │
       │  ◀───────────────────────────────────────│
       │                                          │
       │  Verify signature against AuthorityKey   │
       │  Insert into CadrePeer table             │
       │  Connect to control network              │
       │  Begin watching Strand table             │
       │                                          │
```

The `bootstrapNodes` list typically includes a relay-routed multiaddr pointing to an existing cadre node (like the user's phone via a relay).

## Strand Lifecycle

### Reactive Strand Management

Cadre nodes watch the control network's `Strand` table for changes. When a strand is added, each node:

1. Creates a new libp2p node with protocol prefix `/sereus/strand/<strand-id>`
2. Loads the strand's sApp schema via declarative schema
3. Bootstraps into the strand's cohort
4. Begins participating in transactions

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Strand Lifecycle                               │
│                                                                     │
│  Control Network                    Cadre Node                      │
│  ┌───────────────┐                 ┌───────────────┐               │
│  │               │                 │               │               │
│  │  INSERT INTO  │   watch event   │  Strand       │               │
│  │  Strand (...)─┼────────────────▶│  Watcher      │               │
│  │               │                 │       │       │               │
│  └───────────────┘                 │       ▼       │               │
│                                    │  ┌─────────┐  │               │
│                                    │  │ Start   │  │               │
│                                    │  │ Strand  │  │               │
│                                    │  │ Instance│  │               │
│                                    │  └────┬────┘  │               │
│                                    │       │       │               │
│                                    │       ▼       │               │
│                                    │  libp2p node  │               │
│                                    │  + Optimystic │               │
│                                    │  + sApp Schema│               │
│                                    └───────────────┘               │
│                                                                     │
│  ┌───────────────┐                 ┌───────────────┐               │
│  │               │                 │               │               │
│  │  DELETE FROM  │   watch event   │  Strand       │               │
│  │  Strand (...) ┼────────────────▶│  Watcher      │               │
│  │               │                 │       │       │               │
│  └───────────────┘                 │       ▼       │               │
│                                    │  ┌─────────┐  │               │
│                                    │  │ Stop    │  │               │
│                                    │  │ Strand  │  │               │
│                                    │  │ Instance│  │               │
│                                    │  └─────────┘  │               │
│                                    └───────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### Strand Formation

When forming a new strand with another party, the bootstrap protocol (`strand-proto`) negotiates provisioning:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Strand Formation Flow                            │
│                                                                     │
│  Party A (Responder)              Party B (Initiator)              │
│  ┌────────────────┐               ┌────────────────┐               │
│  │                │               │                │               │
│  │ FormationInvite│               │ Receives       │               │
│  │ token created  │               │ invitation     │               │
│  │                │               │ out-of-band    │               │
│  └───────┬────────┘               └───────┬────────┘               │
│          │                                │                         │
│          │                                │ formStrand(token,       │
│          │                                │   disclosure)           │
│          │◀───────────────────────────────┤                         │
│          │ Contact message                │                         │
│          │                                │                         │
│          │ Validate token                 │                         │
│          │ Validate identity              │                         │
│          │ Record FormationUsage          │                         │
│          │                                │                         │
│          │ Provision strand               │                         │
│          │ (responderCreates mode)        │                         │
│          │                                │                         │
│          ├───────────────────────────────▶│                         │
│          │ Response with strand info      │                         │
│          │                                │                         │
│          │                                │ Add to Strand table     │
│          │                                │ (both parties)          │
│          │                                │                         │
│  ┌───────┴────────┐               ┌───────┴────────┐               │
│  │ Strand row     │               │ Strand row     │               │
│  │ triggers node  │               │ triggers node  │               │
│  │ participation  │               │ participation  │               │
│  └────────────────┘               └────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### Strand Hibernation

A party may participate in many strands (potentially hundreds), but most are inactive at any given time. Maintaining live libp2p connections for all strands wastes resources. The hibernation system manages strand instance lifecycle based on activity:

**Strand States:**

| State | Description | Connections |
|-------|-------------|-------------|
| `active` | Actively transacting, recent activity | Full libp2p node running |
| `idle` | No recent activity, monitoring for wake | Minimal or no connections |
| `hibernating` | Long-term inactive | No connections, wake via control network |

**Activity-Based Transitions:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Strand State Machine                             │
│                                                                     │
│                         ┌────────────┐                              │
│                         │   active   │◀─────────────────────────┐  │
│                         └─────┬──────┘                          │  │
│                               │                                  │  │
│                   idle timeout (configurable)                   │  │
│                               │                                  │  │
│                               ▼                                  │  │
│                         ┌────────────┐      incoming activity   │  │
│                         │    idle    │──────────────────────────┘  │
│                         └─────┬──────┘                             │
│                               │                                     │
│                    extended idle + backoff                         │
│                               │                                     │
│                               ▼                                     │
│                         ┌────────────┐      wake signal            │
│                         │hibernating │─────────────────────────────┘
│                         └────────────┘                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Idle Strand Behavior:**
- Disconnect from strand peers but retain local state
- Periodic check-in with exponential backoff (minutes → hours → days)
- Check-in queries cohort for pending transactions

**Wake Mechanisms:**
1. **Local wake**: Application explicitly activates the strand
2. **Check-in wake**: Periodic check-in discovers pending activity
3. **Push wake**: Another cadre member (with incoming connectivity) receives wake request and propagates via control network

**sApp Latency Hints:**

Applications can provide latency hints in the strand header that influence hibernation behavior:

| Hint | Idle Timeout | Check-in Interval | Use Case |
|------|--------------|-------------------|----------|
| `realtime` | Never hibernate | N/A | Messaging, live collaboration |
| `interactive` | 5 minutes | 30 seconds | Active apps, transactions |
| `background` | 1 minute | 5 minutes | Social feeds, notifications |
| `archive` | 10 seconds | 1 hour | Rarely accessed data |

## Network Isolation

Each strand operates as a completely isolated libp2p network. This isolation is achieved through:

1. **Protocol prefix**: Each strand uses `/sereus/strand/<strand-id>` as its protocol prefix for all services (identify, pubsub, cluster, fret)
2. **Separate libp2p node**: Each strand instance runs its own libp2p node with independent connection management
3. **Independent DHT**: Each strand's FRET overlay is scoped to its protocol prefix
4. **Separate storage namespace**: Each strand's Optimystic data is partitioned by strand ID

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Network Isolation Model                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     Control Network                          │   │
│  │             /sereus/control/<party-id>                       │   │
│  │                                                              │   │
│  │  Peers: Only this party's cadre nodes                       │   │
│  │  Data:  CadreControl schema                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────┐   │
│  │  Strand Network A │  │  Strand Network B │  │ Strand Net C  │   │
│  │                   │  │                   │  │               │   │
│  │  /sereus/strand/  │  │  /sereus/strand/  │  │ /sereus/...   │   │
│  │    <uuid-a>       │  │    <uuid-b>       │  │   <uuid-c>    │   │
│  │                   │  │                   │  │               │   │
│  │  Peers: Cohort A  │  │  Peers: Cohort B  │  │ Peers: Coh C  │   │
│  │  (Party 1, 2, 3)  │  │  (Party 1, 4)     │  │ (Party 1, 5)  │   │
│  │                   │  │                   │  │               │   │
│  │  Data: sApp A +   │  │  Data: sApp B +   │  │ Data: sApp C +│   │
│  │        Strand     │  │        Strand     │  │       Strand  │   │
│  │        schema     │  │        schema     │  │       schema  │   │
│  └───────────────────┘  └───────────────────┘  └───────────────┘   │
│                                                                     │
│  No cross-network communication. Each network has its own:         │
│  • Connection pool                                                  │
│  • Gossipsub mesh                                                   │
│  • FRET routing table                                               │
│  • Cluster coordination                                             │
└─────────────────────────────────────────────────────────────────────┘
```

## Provider Integration

Cloud providers can host cadre nodes on behalf of users. The provider never has access to user keys—nodes generate their own libp2p identity and are authorized via signed messages.

### Provider Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Provider Enrollment Flow                         │
│                                                                     │
│  User (Phone)           Provider API           Provider Container   │
│  ┌─────────┐            ┌─────────┐            ┌─────────────────┐ │
│  │         │            │         │            │                 │ │
│  │         │  1. Request│         │            │                 │ │
│  │         │────────────▶         │            │                 │ │
│  │         │  container │         │            │                 │ │
│  │         │  (payment) │         │            │                 │ │
│  │         │            │         │ 2. Spawn   │                 │ │
│  │         │            │         │───────────▶│                 │ │
│  │         │            │         │            │ createCadrePeer │ │
│  │         │            │         │            │ (generates key) │ │
│  │         │            │         │◀───────────│                 │ │
│  │         │◀───────────│         │ 3. Return  │                 │ │
│  │         │ PeerId     │         │    PeerId  │                 │ │
│  │         │            │         │            │                 │ │
│  │ Sign    │            │         │            │                 │ │
│  │ with    │            │         │            │                 │ │
│  │ authority            │         │            │                 │ │
│  │ key     │            │         │            │                 │ │
│  │         │            │         │            │                 │ │
│  │         │ 4. registerCadrePeer(peerId, bootstrap, sig)        │ │
│  │         │────────────────────────────────────────────────────▶│ │
│  │         │            │         │            │                 │ │
│  │         │            │         │            │ Join control    │ │
│  │         │            │         │            │ network         │ │
│  │         │            │         │            │                 │ │
│  │         │            │         │            │ Watch Strand    │ │
│  │         │            │         │            │ table           │ │
│  │         │            │         │            │                 │ │
│  └─────────┘            └─────────┘            └─────────────────┘ │
│                                                                     │
│  Provider only sees: container ID, network traffic                 │
│  Provider never has: authority keys, strand data (encrypted)       │
└─────────────────────────────────────────────────────────────────────┘
```

### Relay Bootstrap

When a user's phone is the only existing cadre node, it must be reachable for new nodes to join. This is achieved via circuit relay:

1. Phone connects to a public relay (provider-operated or community)
2. Phone's relay-routed multiaddr is included in `bootstrapNodes` during registration
3. New node dials phone via relay to join control network
4. Once multiple nodes exist, the control network becomes more resilient

```
Phone multiaddr via relay:
/dns4/relay.provider.com/tcp/4001/p2p/<relay-peer-id>/p2p-circuit/p2p/<phone-peer-id>
```

## Deployment Configurations

### Minimal (Single Phone)

```
┌──────────────────────────────────────────────────────────────────┐
│                    Single Phone Cadre                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      Phone                                │   │
│  │                                                           │   │
│  │  Control Network: Party's sole node                       │   │
│  │  Profile: Transaction-only                                │   │
│  │  Connectivity: Via relay when behind NAT                  │   │
│  │                                                           │   │
│  │  Strands: Participates in all, limited by battery/conn   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Limitations:                                                    │
│  • No redundancy (phone offline = party unreachable)            │
│  • No archival storage (transaction-only)                       │
│  • Dependent on relays for inbound connectivity                 │
└──────────────────────────────────────────────────────────────────┘
```

### Standard (Phone + Cloud Node)

```
┌──────────────────────────────────────────────────────────────────┐
│                  Phone + Cloud Cadre                             │
│                                                                  │
│  ┌────────────────────┐      ┌────────────────────────────────┐ │
│  │       Phone        │      │        Cloud Node              │ │
│  │                    │      │                                │ │
│  │  Profile: Txn-only │◀────▶│  Profile: Storage              │ │
│  │  Always has latest │      │  Always online                 │ │
│  │  authority keys    │      │  Public IP (no relay needed)   │ │
│  │                    │      │  Archival storage enabled      │ │
│  └────────────────────┘      └────────────────────────────────┘ │
│                                                                  │
│  Benefits:                                                       │
│  • Redundancy (either node can serve control network)           │
│  • Storage capacity for strand data                             │
│  • Cloud node bootstrap for new nodes/peers                     │
└──────────────────────────────────────────────────────────────────┘
```

### Enterprise (Multi-Node Mixed)

```
┌──────────────────────────────────────────────────────────────────┐
│               Enterprise Multi-Node Cadre                        │
│                                                                  │
│  ┌────────┐  ┌────────┐  ┌────────────┐  ┌─────────────────────┐│
│  │ Phone  │  │ Laptop │  │ Cloud (x3) │  │ On-prem NAS (x2)   ││
│  │        │  │        │  │            │  │                    ││
│  │ Txn    │  │ Txn    │  │ Storage    │  │ Storage (primary)  ││
│  │ only   │  │ only   │  │ (backup)   │  │                    ││
│  └────────┘  └────────┘  └────────────┘  └─────────────────────┘│
│                                                                  │
│  Features:                                                       │
│  • High availability (multiple always-on nodes)                 │
│  • Geo-distributed storage                                      │
│  • Key material secured on mobile devices                       │
│  • Scales to many strands                                       │
└──────────────────────────────────────────────────────────────────┘
```

## Package Structure

The cadre system is implemented across several packages:

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Package Hierarchy                             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    @sereus/cadre-core                        │   │
│  │                                                              │   │
│  │  Core library for any cadre member. Platform-agnostic.      │   │
│  │                                                              │   │
│  │  • CadreNode class (main entry point)                       │   │
│  │  • Control network management                                │   │
│  │  • Strand instance lifecycle                                 │   │
│  │  • Enrollment API (createCadrePeer, registerCadrePeer)      │   │
│  │  • Profile configuration (transaction vs storage)           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│        ┌─────────────────────┼─────────────────────┐               │
│        │                     │                     │               │
│        ▼                     ▼                     ▼               │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────────────┐│
│  │ @sereus/      │   │ Mobile        │   │ Container runtime     ││
│  │ cadre-cli     │   │ integration   │   │ (provider-specific)   ││
│  │               │   │ (app code)    │   │                       ││
│  │ CLI wrapper   │   │               │   │ Docker entrypoint     ││
│  │ for servers   │   │ React Native  │   │ Health checks         ││
│  │               │   │ NativeScript  │   │ Provider enrollment   ││
│  └───────────────┘   └───────────────┘   └───────────────────────┘│
│                                                                     │
│  Dependencies:                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ @optimystic/db-p2p    - libp2p node creation, networking    │   │
│  │ @quereus/quereus      - SQL engine, schema management       │   │
│  │ @optimystic/fret      - DHT routing                         │   │
│  │ @sereus/strand-proto  - bootstrap protocol                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Data Structures

### CadreNode Configuration

```typescript
interface CadreNodeConfig {
  // Node identity
  privateKey?: Uint8Array;        // If provided, use this keypair

  // Control network connection
  controlNetwork: {
    partyId: string;              // UUID of the party/control network
    bootstrapNodes: string[];     // Multiaddrs to join control network
  };

  // Node profile
  profile: 'transaction' | 'storage';

  // Strand filtering (which strands to participate in)
  strandFilter?:
    | { mode: 'all' }                           // All strands (default for servers)
    | { mode: 'sAppId'; sAppId: string }        // Only strands for specific app
    | { mode: 'strandId'; strandId: string }    // Single specific strand
    | { mode: 'none' };                         // Control network only

  // Storage configuration (only for storage profile)
  storage?: {
    type: 'memory' | 'file';
    path?: string;
    quotaBytes?: number;          // Maximum storage to use
  };

  // Network configuration
  network: {
    listenAddrs?: string[];       // Addresses to listen on
    announceAddrs?: string[];     // Addresses to advertise
    relayAddrs?: string[];        // Relay servers to connect through
    enableRelay?: boolean;        // Enable circuit relay server (default: true for storage profile)
  };

  // Hibernation configuration
  hibernation?: {
    enabled: boolean;             // Whether to hibernate idle strands
    defaultLatencyHint?: 'realtime' | 'interactive' | 'background' | 'archive';
  };
}
```

### Strand Instance State

```typescript
interface StrandInstance {
  strandId: string;
  status: 'starting' | 'active' | 'idle' | 'hibernating' | 'stopping' | 'stopped' | 'error';

  // App information (from strand header, verified by signature)
  sAppInfo: {
    Id: string;                // Public key of app author
    Version: string;
    Schema: string;            // The declarative schema DDL
    Signature: string;         // Author's signature over schema
  };

  // Runtime components (only when active/idle)
  libp2pNode?: Libp2p;
  database?: Database;

  // Membership info (for closed strands)
  memberKey?: string;
  memberPrivateKey?: string;

  // Activity tracking
  connectedPeers: number;
  lastActivity: Date;
  nextCheckIn?: Date;             // For idle/hibernating strands

  // Latency hint (from app or override)
  latencyHint: 'realtime' | 'interactive' | 'background' | 'archive';
}
```

## References

### Internal Documentation

- [Arachnode Architecture](arachnode.md) - Storage ring system
- [Strand Management](strands.md) - Strand concepts and negotiation
- [Bootstrap Protocol](strand-proto.md) - Formation protocol details
- [API Specification](api.md) - Cadre peer authorization API

### Schemas

- `schemas/control.qsql` - CadreControl schema for control network
- `schemas/strand.qsql` - Strand schema for membership management

### Existing Implementations

- `@gotchoices/optimystic/packages/db-p2p` - libp2p node creation with Optimystic integration
- `packages/strand-proto` - Bootstrap session management
- `packages/reference-peer` - Reference CLI implementation
- `packages/cadre-core` - Core cadre node library
- `packages/cadre-cli` - CLI wrapper for cadre nodes
- `packages/cadre-provider` - Reference provider service for hosting cadre nodes
- `ops/docker/libp2p-infra` - Container infrastructure for relay/bootstrap nodes

---

## TODO

### Phase 1: Core Library (`@sereus/cadre-core`)

- [x] **CadreNode class**: Main entry point that manages control network and strand instances
  - [x] Constructor accepts `CadreNodeConfig`
  - [x] `start()` / `stop()` lifecycle methods
  - [x] Internal control network libp2p node creation
  - [x] Event emission for lifecycle events (`control:connected`, `control:disconnected`, `strand:started`, `strand:stopped`, `strand:error`)
  - [x] Schema loading for CadreControl (stub - returns empty strand list)

- [x] **Strand watcher**: Reactive component that monitors control network
  - [x] Poll-based watching (until Optimystic supports reactive subscriptions)
  - [x] Trigger strand instance start/stop on row changes
  - [x] Apply strand filter from config (all/strandId/none modes complete)
  - [x] sAppId filter mode (filters by sAppId when lookup is available)
  - [x] Schema application per strand (wraps sApp DDL in `declare schema App { ... }; apply schema App;`)

- [x] **Strand instance manager**: Creates and manages per-strand libp2p nodes
  - [x] `startStrand(strandId, config)` - spin up isolated libp2p instance
  - [x] `stopStrand(strandId)` - graceful shutdown
  - [x] `stopAll()` - shutdown all instances
  - [x] Protocol prefix configuration per strand (`/sereus/strand/<strandId>`)
  - [x] Isolated storage paths per strand (`<basePath>/strands/<strandId>/`)
  - [x] sApp config tracking (id, version, schema, signature, latencyHint)
  - [ ] App schema verification (AppSignature validates AppSchema)

- [x] **Enrollment API**: Methods for adding new peers
  - [x] `createCadrePeer()` - generate Ed25519 keypair, return PeerId and private key
  - [x] `registerCadrePeer(peerId, bootstrapNodes, authorityKey, signature)` - verify and add to control network
  - [x] `validateRegistration()` - pre-flight check for registration validity
  - [x] Signature verification interface (`AuthorityVerifier`)
  - [x] Peer registration interface (`PeerRegistry`)

- [x] **Member Registration API**: Accept invitations to join strands
  - [x] `registerMember(registration, signature)` - accept strand invitation and join as member
  - [x] `validateMemberRegistration()` - pre-flight validation
  - [x] Member verification interface (`MemberVerifier`)
  - [x] Member registry interface (`MemberRegistry`)

- [x] **Strand Solicitation API**: Form strands via open invitations
  - [x] `OpenInvitation` type - token, sAppId, expiration, bootstrap addresses
  - [x] `formStrand(token, disclosure)` - initiator forms strand with responder via open invitation
  - [x] `validateStrandFormation(token, disclosure)` - responder validates and approves formation
  - [x] `createOpenInvitation()` - create shareable invitations
  - [x] Disclosure validation hooks (`DisclosureValidator` interface)
  - [x] Formation usage tracking (`FormationUsageRecorder` interface)
  - [ ] Full integration with `strand-proto` SessionManager for protocol handling

- [x] **Profile configuration**: Transaction vs storage mode
  - [x] Profile configuration in types (`'transaction' | 'storage'`)
  - [x] FRET profile mapping (storage → 'core', transaction → 'edge')
  - [ ] Ring Zulu participation (all nodes) - configuration present
  - [ ] Storage ring opt-in (storage profile only) - Blocked: Arachnode not yet implemented
  - [ ] Quota enforcement for storage nodes

- [x] **Strand hibernation**: Activity-based lifecycle management
  - [x] Latency hint type defined (`'realtime' | 'interactive' | 'background' | 'archive'`)
  - [x] Activity tracking per strand instance (`lastActivity` field)
  - [x] Status tracking (`'starting' | 'active' | 'idle' | 'hibernating' | 'stopping' | 'stopped' | 'error'`)
  - [x] State machine: active → idle → hibernating (HibernationManager)
  - [x] Configurable timeouts based on latency hints (HIBERNATION_TIMEOUTS constant)
  - [x] Check-in with exponential backoff for hibernating strands
  - [x] Wake mechanism via control network propagation
  - [x] App latency hint parsing from sApp config

**Tests**: Unit tests passing covering CadreNode, StrandWatcher, StrandInstanceManager, EnrollmentService, StrandSolicitationService, and type definitions.

#### Incomplete Phase I Items

##### 1. **App schema verification** (AppSignature validates AppSchema)
When joining a strand, the node should verify the sApp schema signature to ensure it hasn't been tampered with.

**Implications:**
- Security gap: malicious schema could be injected
- Trust model incomplete—apps aren't cryptographically verified
- Important for closed strands with sensitive data

##### 2. **Ring Zulu participation** and **Storage ring opt-in** (Blocked: Arachnode not yet implemented)
These are blocked on the Arachnode storage system not being built yet.

**Implications:**
- Profile distinction (`transaction` vs `storage`) has no real effect beyond FRET hints
- No actual distributed archival storage
- Acceptable blocker—correctly marked as a dependency

##### 3. **Quota enforcement for storage nodes**
Storage nodes should enforce capacity limits.

**Implications:**
- Without quotas, a storage node could fill its disk
- Provider billing can't tie to actual storage used
- Lower priority until Arachnode exists

##### 4. **Full integration with strand-proto SessionManager**
The `StrandSolicitationService` has the types but isn't wired to the actual protocol handler.

**Implications:**
- Strand formation works in unit tests with mocks
- Real formation over the network won't work
- Blocks E2E strand creation between parties

---

#### Priority Assessment

| Item | Priority | Reason |
|------|----------|--------|
| strand-proto SessionManager integration | **High** | Needed for real strand formation |
| App schema verification | **Medium** | Security hardening, can proceed without |
| Ring/quota enforcement | **Low** | Blocked on Arachnode anyway |


### Phase 2: CLI Wrapper (`@sereus/cadre-cli`)

- [x] **Command-line interface**
  - [x] `cadre start` - start node with config file
  - [x] `cadre status` - show control network and strand status
  - [x] `cadre enroll` - enrollment subcommands (create, register)
  - [x] `cadre strands` - list active strands

- [x] **Configuration file format**
  - [x] YAML/JSON config loading
  - [x] Environment variable overrides
  - [x] Secure key file handling

- [x] **Daemon mode**
  - [x] Systemd service file with security hardening
  - [x] Graceful shutdown handling (SIGINT/SIGTERM)
  - [x] Journal logging integration (systemd native)

### Phase 3: Container Runtime

- [x] **Docker image**
  - [x] Dockerfile based on node:22-alpine (`packages/cadre-cli/docker/Dockerfile`)
  - [x] Entrypoint script for enrollment (`packages/cadre-cli/docker/entrypoint.sh`)
  - [x] Volume mounts for data persistence
  - [x] Health check endpoint (`/health`, `/ready`, `/status`)

- [x] **Docker Compose template**
  - [x] Environment variable configuration (`ops/docker/sereus-node/env.example`)
  - [x] Volume definitions (`sereus_cadre_data`)
  - [x] Network configuration (`sereus_network`)

- [x] **Provider integration hooks**
  - [x] Enrollment token consumption (via `CADRE_ENROLLMENT_TOKEN`)
  - [x] Status reporting endpoint (`/status` JSON endpoint)
  - [x] Metrics exposure (Prometheus format at `/metrics` on port 9090)

### Phase 4: Provider Service (`@sereus/cadre-provider`)

- [x] **Provider API**
  - [x] `POST /containers` - allocate new container
  - [x] `GET /containers/:id` - get container status
  - [x] `GET /containers` - list customer containers
  - [x] `DELETE /containers/:id` - terminate container
  - [x] Authentication via API key or OAuth (pluggable hooks)
  - [x] `GET /billing/plans` - list available billing plans
  - [x] `GET /billing/status` - get customer billing status

- [x] **Billing integration**
  - [x] Usage metering (storage, bandwidth, uptime via orchestrator stats)
  - [x] Payment processor hooks (Stripe-ready with `BillingHooks` interface)
  - [x] Quota enforcement (container limits per plan)
  - [x] Default billing plans (starter, professional, enterprise)

- [x] **Orchestration**
  - [x] Docker orchestrator (`DockerOrchestrator` class)
  - [x] Mock orchestrator for testing
  - [x] Pluggable `Orchestrator` interface for custom backends
  - [ ] Kubernetes operator (optional, not yet implemented)
  - [ ] Auto-scaling based on demand
  - [ ] Multi-region deployment

- [x] **Configuration & CLI**
  - [x] YAML/JSON config file support
  - [x] Environment variable overrides
  - [x] `cadre-provider start` CLI command
  - [x] `cadre-provider check` config validation

### Phase 5: Mobile Integration

- [ ] **React Native bindings**
  - [ ] Native module for libp2p (or JS implementation)
  - [ ] Secure key storage (Keychain/Keystore)
  - [ ] Background service for always-on connectivity

- [ ] **Mobile-specific optimizations**
  - [ ] Battery-aware sync scheduling
  - [ ] Network-aware bootstrap (WiFi vs cellular)
  - [ ] Minimal memory footprint

### Infrastructure Prerequisites

- [ ] **Relay network**: Public relays for NAT traversal
  - [ ] Deploy relay nodes in multiple regions
  - [ ] Rate limiting and abuse prevention
  - [ ] dnsaddr records for discovery

- [ ] **Bootstrap nodes**: Initial entry points for control networks
  - [ ] At minimum, one stable bootstrap per deployment
  - [ ] Can be user's own server or provider-hosted

### Testing

- [x] **Unit tests**: Individual component testing (50 tests passing)
  - [x] CadreNode lifecycle and configuration tests
  - [x] StrandWatcher polling and filter tests
  - [x] StrandInstanceManager start/stop tests
  - [x] EnrollmentService peer creation and registration tests
  - [x] Type definition validation tests
- [ ] **Integration tests**: Multi-node control network scenarios
- [ ] **E2E tests**: Full enrollment and strand formation flows
- [ ] **Load tests**: Many strands on single node, many nodes in cohort
