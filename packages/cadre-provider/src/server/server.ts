/**
 * Fastify server setup for cadre-provider.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import debug from 'debug';
import type { ProviderConfig } from '../config/types.js';
import { createStore, type ProviderStore } from '../service/store.js';
import { ContainerService } from '../service/container-service.js';
import { BillingService, type BillingHooks } from '../service/billing-service.js';
import { DockerOrchestrator } from '../service/docker-orchestrator.js';
import { MockOrchestrator, type Orchestrator } from '../service/orchestrator.js';
import { registerRoutes } from './routes.js';
import { registerAuth, type AuthHooks } from './auth.js';

const log = debug('cadre:provider:server');

/** Provider server options */
export interface ProviderServerOptions {
  /** Full configuration */
  config: ProviderConfig;
  /** Custom authentication hooks */
  authHooks?: AuthHooks;
  /** Custom billing hooks */
  billingHooks?: BillingHooks;
  /** Custom orchestrator (for testing) */
  orchestrator?: Orchestrator;
  /** Custom store (for testing) */
  store?: ProviderStore;
}

/** Provider server instance */
export interface ProviderServer {
  /** The Fastify instance */
  app: FastifyInstance;
  /** Container service */
  containerService: ContainerService;
  /** Billing service */
  billingService: BillingService;
  /** Start the server */
  start(): Promise<void>;
  /** Stop the server */
  stop(): Promise<void>;
}

/** Create a provider server */
export async function createProviderServer(
  options: ProviderServerOptions
): Promise<ProviderServer> {
  const { config, authHooks, billingHooks } = options;

  log('Creating provider server');

  // Create Fastify instance
  const app = Fastify({
    logger: config.logging.level === 'debug',
  });

  // Register CORS
  await app.register(fastifyCors, {
    origin: config.server.cors?.origin ?? true,
    credentials: config.server.cors?.credentials ?? true,
  });

  // Create store
  const store = options.store ?? createStore(config.storage);

  // Create orchestrator
  let orchestrator: Orchestrator;
  if (options.orchestrator) {
    orchestrator = options.orchestrator;
  } else if (config.docker.socketPath) {
    try {
      orchestrator = new DockerOrchestrator(config.docker);
    } catch (err) {
      log('Docker unavailable, using mock orchestrator: %O', err);
      orchestrator = new MockOrchestrator();
    }
  } else {
    orchestrator = new MockOrchestrator();
  }

  // Create services
  const containerService = new ContainerService({ store, orchestrator });
  const billingService = new BillingService({
    config: config.billing,
    store,
    orchestrator,
    hooks: billingHooks,
  });

  // Register auth middleware
  registerAuth(app, {
    config: config.auth,
    store,
    hooks: authHooks,
  });

  // Register routes
  const basePath = config.server.basePath ?? '/api/v1';
  registerRoutes(app, {
    basePath,
    containerService,
    billingService,
  });

  log('Server configured at %s', basePath);

  // Server lifecycle
  const start = async () => {
    // Start billing service
    billingService.start();

    // Start HTTP server
    const address = await app.listen({
      host: config.server.host ?? '0.0.0.0',
      port: config.server.port ?? 3000,
    });

    log('Server listening at %s', address);
    console.log(`Cadre Provider API listening at ${address}${basePath}`);
  };

  const stop = async () => {
    log('Stopping server');
    billingService.stop();
    await app.close();
    log('Server stopped');
  };

  return {
    app,
    containerService,
    billingService,
    start,
    stop,
  };
}

