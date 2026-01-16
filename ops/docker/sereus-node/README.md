## Docker: Sereus Cadre Node (Headless Optimystic Cadre Member)

This folder contains Docker resources for running a **headless cadre node** that can be added to a user's **cadre** (their personal infrastructure cluster).

### What it is
- A long-running node process providing storage/replication capacity and p2p connectivity on behalf of a user
- Connects to the user's control network and automatically participates in strands
- Deployable on servers, NAS devices, or cloud providers

### Quick Start

```bash
# 1. Copy environment template
cp env.example .env

# 2. Configure required settings
#    - CADRE_PARTY_ID: Your party/control network UUID
#    - CADRE_BOOTSTRAP_NODES: Multiaddrs of your bootstrap nodes

# 3. Start the node
docker compose up -d

# 4. Check logs
docker compose logs -f

# 5. Check health
curl http://localhost:8080/health
```

### Endpoints

| Port | Endpoint | Description |
|------|----------|-------------|
| 4001 | libp2p   | P2P network port |
| 8080 | /health  | Liveness probe (returns 200 when running) |
| 8080 | /ready   | Readiness probe (returns 200 when connected) |
| 8080 | /status  | Detailed JSON status |
| 9090 | /metrics | Prometheus metrics |

### Configuration

Configuration is done via environment variables. See `env.example` for all options.

**Required:**
- `CADRE_PARTY_ID` - Your party UUID (identifies your control network)
- `CADRE_BOOTSTRAP_NODES` - Comma-separated multiaddrs of bootstrap nodes

**Optional:**
- `CADRE_PROFILE` - Node profile: `storage` (default) or `transaction`
- `CADRE_ANNOUNCE_ADDRS` - External addresses to announce
- `CADRE_RELAY_ADDRS` - Relay servers for NAT traversal

### Data Persistence

Node data (keys, storage) is persisted in a Docker volume (`sereus_cadre_data`).

To backup your peer identity:
```bash
docker compose exec cadre-node cat /data/cadre-peer.key > backup.key
```

### Integration Testing

For integration testing, use the `docker-compose.test.yml` overlay:

```bash
# Start test cluster
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d

# Run tests against the cluster
npm test

# Teardown
docker compose -f docker-compose.yml -f docker-compose.test.yml down -v
```

### Provider Integration

For provider deployments (hosting nodes on behalf of users):

1. Set `CADRE_PROVIDER_API` to your status reporting endpoint
2. Optionally set `CADRE_ENROLLMENT_TOKEN` for automated enrollment
3. Monitor `/metrics` endpoint for billing/usage data
