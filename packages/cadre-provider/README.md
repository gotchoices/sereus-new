# @sereus/cadre-provider

Reference provider service for hosting Sereus cadre nodes on behalf of users.

## Overview

This package provides a complete provider API that enables:
- **Container Management**: Allocate, monitor, and terminate cadre node containers
- **Billing Integration**: Usage metering, quota enforcement, and payment processor hooks
- **Authentication**: API key and OAuth/JWT authentication
- **Docker Orchestration**: Container lifecycle management via Docker API

## Installation

```bash
npm install @sereus/cadre-provider
```

## Quick Start

### CLI Usage

```bash
# Start the provider service
cadre-provider start -c provider.yaml

# Validate configuration
cadre-provider check -c provider.yaml

# Enable debug logging
cadre-provider start -c provider.yaml --debug
```

### Programmatic Usage

```typescript
import { createProviderServer, loadConfig } from '@sereus/cadre-provider';

const config = loadConfig({ configFile: 'provider.yaml' });
const server = await createProviderServer({ config });
await server.start();
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/status` | Health check |
| POST | `/api/v1/containers` | Create a new container |
| GET | `/api/v1/containers` | List customer's containers |
| GET | `/api/v1/containers/:id` | Get container status |
| DELETE | `/api/v1/containers/:id` | Terminate container |
| GET | `/api/v1/billing/plans` | List billing plans |
| GET | `/api/v1/billing/status` | Get customer billing status |

## Configuration

Configuration can be provided via YAML/JSON file or environment variables.

### Example Configuration

```yaml
server:
  host: 0.0.0.0
  port: 3000
  basePath: /api/v1

auth:
  mode: api-key  # none, api-key, or oauth

docker:
  socketPath: /var/run/docker.sock
  network: sereus_provider
  image: sereus-cadre-node:latest
  defaultResources:
    memoryLimit: 512M
    cpuLimit: "0.5"

billing:
  enabled: true
  stripeSecretKey: sk_test_...
  usageCollectionIntervalSec: 60

storage:
  type: file
  path: /data/provider
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PROVIDER_HOST` | Server host |
| `PROVIDER_PORT` | Server port |
| `PROVIDER_AUTH_MODE` | Authentication mode |
| `PROVIDER_DOCKER_SOCKET` | Docker socket path |
| `PROVIDER_DOCKER_IMAGE` | Container image |
| `STRIPE_SECRET_KEY` | Stripe API key |

## Custom Authentication

```typescript
import { createProviderServer, loadConfig, type AuthHooks } from '@sereus/cadre-provider';

const authHooks: AuthHooks = {
  async validateJwt(token) {
    const user = await verifyMyJWT(token);
    return {
      customerId: user.id,
      permissions: user.scopes,
    };
  },
};

const server = await createProviderServer({
  config: loadConfig(),
  authHooks,
});
```

## Custom Billing

```typescript
import { createProviderServer, loadConfig, type BillingHooks } from '@sereus/cadre-provider';

const billingHooks: BillingHooks = {
  async processPayment(customerId, amountCents) {
    const result = await stripe.charges.create({ ... });
    return { success: true, transactionId: result.id };
  },
};

const server = await createProviderServer({
  config: loadConfig(),
  billingHooks,
});
```

## Deployment

### Docker

```bash
docker build -t cadre-provider .
docker run -p 3000:3000 -v /var/run/docker.sock:/var/run/docker.sock cadre-provider
```

### Kubernetes

For Kubernetes deployments, implement a custom orchestrator or use the Docker orchestrator with Docker-in-Docker.

## License

MIT

