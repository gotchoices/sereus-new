import { Command } from 'commander';
import debug from 'debug';
import { CadreNode, type CadreNodeConfig } from '@sereus/cadre-core';
import { resolveConfig } from '../config/index.js';
import { HealthServer } from '../server/health.js';

const log = debug('cadre:cli:start');

export const startCommand = new Command('start')
  .description('Start the cadre node with the specified configuration')
  .option('-c, --config <path>', 'Path to config file (YAML or JSON)', 'cadre.yaml')
  .option('-d, --debug', 'Enable debug logging')
  .option('--health-port <port>', 'Health check server port', '8080')
  .option('--metrics-port <port>', 'Prometheus metrics server port', '9090')
  .option('--no-health-server', 'Disable health check and metrics servers')
  .action(async (options) => {
    if (options.debug) {
      debug.enable('cadre:*,sereus:*');
    }

    console.log('Starting cadre node...');
    log('Loading configuration from: %s', options.config);

    try {
      const config = await resolveConfig(options.config);

      const nodeConfig: CadreNodeConfig = {
        privateKey: config.privateKey,
        controlNetwork: config.controlNetwork,
        profile: config.profile,
        strandFilter: config.strandFilter,
        storage: config.storage,
        network: config.network,
        hibernation: config.hibernation,
        strandWatchInterval: config.strandWatchInterval,
      };

      const node = new CadreNode(nodeConfig);

      // Set up event handlers
      node.on('control:connected', () => {
        console.log('✓ Connected to control network');
        console.log(`  Party ID: ${config.controlNetwork.partyId}`);
        console.log(`  Peer ID:  ${node.peerId?.toString()}`);
      });

      node.on('control:disconnected', () => {
        console.log('✗ Disconnected from control network');
      });

      node.on('strand:started', ({ strandId }) => {
        console.log(`✓ Strand started: ${strandId}`);
      });

      node.on('strand:stopped', ({ strandId }) => {
        console.log(`• Strand stopped: ${strandId}`);
      });

      node.on('strand:error', ({ strandId, error }) => {
        console.error(`✗ Strand error (${strandId}): ${error.message}`);
      });

      node.on('strand:idle', ({ strandId }) => {
        log('Strand idle: %s', strandId);
      });

      node.on('strand:hibernating', ({ strandId }) => {
        log('Strand hibernating: %s', strandId);
      });

      // Start health/metrics servers if enabled
      let healthServer: HealthServer | null = null;
      if (options.healthServer !== false) {
        const healthPort = parseInt(process.env.CADRE_HEALTH_PORT ?? options.healthPort, 10);
        const metricsPort = parseInt(process.env.CADRE_METRICS_PORT ?? options.metricsPort, 10);

        healthServer = new HealthServer({ healthPort, metricsPort });
        healthServer.attach(node);
        await healthServer.start();
        console.log(`✓ Health server on port ${healthPort}, metrics on port ${metricsPort}`);
      }

      // Handle graceful shutdown
      const shutdown = async () => {
        console.log('\nShutting down...');
        if (healthServer) {
          await healthServer.stop();
        }
        await node.stop();
        console.log('Cadre node stopped.');
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Start the node
      await node.start();

      console.log('Cadre node running. Press Ctrl+C to stop.');

      // Keep the process alive
      await new Promise(() => {});

    } catch (error) {
      console.error('Failed to start cadre node:', error instanceof Error ? error.message : error);
      log('Error details: %o', error);
      process.exit(1);
    }
  });

