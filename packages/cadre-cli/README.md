# @sereus/cadre-cli

CLI wrapper for Sereus cadre nodes - start, monitor, and manage cadre node instances.

## Installation

```bash
npm install @sereus/cadre-cli
```

## Usage

### Start a Node

```bash
cadre start -c cadre.yaml
cadre start -c cadre.yaml --debug
```

### Check Status

```bash
cadre status -c cadre.yaml
cadre status --json
```

### Enroll New Peers

Create a new peer identity:

```bash
cadre enroll create --output ./keys --name my-node
```

Register a peer (requires authority signature):

```bash
cadre enroll register \
  --peer-id 12D3KooW... \
  --bootstrap /ip4/.../tcp/4001/p2p/12D3KooW... \
  --authority-key <public-key> \
  --signature <signature>
```

### List Strands

```bash
cadre strands -c cadre.yaml
cadre strands --json
```

## Configuration

See [example.cadre.yaml](./example.cadre.yaml) for a complete configuration example.

### Environment Variables

| Variable | Config Path | Description |
|----------|-------------|-------------|
| `CADRE_PARTY_ID` | `controlNetwork.partyId` | Party/control network UUID |
| `CADRE_BOOTSTRAP_NODES` | `controlNetwork.bootstrapNodes` | Comma-separated multiaddrs |
| `CADRE_PROFILE` | `profile` | Node profile (transaction/storage) |
| `CADRE_KEY_FILE` | `identity.keyFile` | Path to private key file |
| `CADRE_STORAGE_PATH` | `storage.path` | Data storage directory |
| `CADRE_STORAGE_TYPE` | `storage.type` | Storage type (memory/file) |
| `CADRE_HIBERNATION_ENABLED` | `hibernation.enabled` | Enable strand hibernation |

Environment variables override config file values.

## Systemd Service (Linux)

For production deployments on Linux, use the included systemd service file.

### Quick Install

```bash
sudo ./contrib/cadre-install.sh
```

### Manual Installation

1. Create service user and directories:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin cadre
sudo mkdir -p /opt/cadre /etc/cadre /var/lib/cadre
sudo chown cadre:cadre /var/lib/cadre
```

2. Install the package:

```bash
cd /opt/cadre
sudo npm init -y
sudo npm install @sereus/cadre-cli @sereus/cadre-core
```

3. Copy and edit configuration:

```bash
sudo cp /opt/cadre/node_modules/@sereus/cadre-cli/example.cadre.yaml /etc/cadre/cadre.yaml
sudo nano /etc/cadre/cadre.yaml
```

4. Generate peer identity:

```bash
sudo -u cadre cadre enroll create --output /etc/cadre --name cadre-peer
```

5. Install and start the service:

```bash
sudo cp /opt/cadre/node_modules/@sereus/cadre-cli/contrib/cadre-node.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cadre-node
sudo systemctl start cadre-node
```

### Service Management

```bash
# Check status
systemctl status cadre-node

# View logs
journalctl -u cadre-node -f

# Restart
systemctl restart cadre-node

# Stop
systemctl stop cadre-node
```

### Service Configuration

The systemd service includes security hardening:

- Runs as unprivileged `cadre` user
- Read-only filesystem except `/var/lib/cadre`
- Private `/tmp` and no access to `/home`
- Memory limit (8GB default, adjustable)

Edit `/etc/systemd/system/cadre-node.service` to customize resource limits.

## Programmatic Usage

```typescript
import { resolveConfig } from '@sereus/cadre-cli';
import { CadreNode } from '@sereus/cadre-core';

const config = await resolveConfig('cadre.yaml');
const node = new CadreNode(config);

node.on('control:connected', () => console.log('Connected'));
node.on('strand:started', ({ strandId }) => console.log(`Strand ${strandId} started`));

await node.start();
```

## License

MIT

