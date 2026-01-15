import { Command } from 'commander';
import debug from 'debug';
import { CadreNode, type CadreNodeConfig, type StrandInstance } from '@sereus/cadre-core';
import { resolveConfig } from '../config/index.js';

const log = debug('cadre:cli:strands');

export const strandsCommand = new Command('strands')
  .description('List active strands')
  .option('-c, --config <path>', 'Path to config file (YAML or JSON)', 'cadre.yaml')
  .option('--json', 'Output in JSON format')
  .option('-d, --debug', 'Enable debug logging')
  .action(async (options) => {
    if (options.debug) {
      debug.enable('cadre:*,sereus:*');
    }

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

      console.log('Connecting to control network...');
      const node = new CadreNode(nodeConfig);

      // Set up a timeout
      const timeout = setTimeout(() => {
        console.error('Timeout connecting to control network');
        node.stop().catch(() => {});
        process.exit(1);
      }, 30000);

      node.on('control:connected', async () => {
        clearTimeout(timeout);
        log('Connected to control network');

        // Force a poll to get current strands
        await node.forceStrandPoll();

        const strands = node.getStrands();

        if (options.json) {
          const data = Array.from(strands.values()).map(formatStrandJson);
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log('\nActive Strands');
          console.log('─────────────────────────────────────────');

          if (strands.size === 0) {
            console.log('No active strands.');
          } else {
            for (const [strandId, instance] of strands) {
              printStrand(strandId, instance);
            }
          }

          console.log(`\nTotal: ${strands.size} strand(s)`);
        }

        await node.stop();
        process.exit(0);
      });

      await node.start();

    } catch (error) {
      console.error('Failed to list strands:', error instanceof Error ? error.message : error);
      log('Error details: %o', error);
      process.exit(1);
    }
  });

function printStrand(strandId: string, instance: StrandInstance): void {
  const statusIcon = {
    starting: '⋯',
    active: '●',
    idle: '○',
    hibernating: '◦',
    stopping: '⋯',
    stopped: '○',
    error: '✗',
  }[instance.status] ?? '?';

  console.log(`\n${statusIcon} ${strandId}`);
  console.log(`  Status:       ${instance.status}`);
  console.log(`  Latency Hint: ${instance.latencyHint}`);
  console.log(`  Peers:        ${instance.connectedPeers}`);
  console.log(`  Last Activity: ${instance.lastActivity.toISOString()}`);

  if (instance.sAppInfo) {
    console.log(`  sApp ID:      ${instance.sAppInfo.id}`);
    console.log(`  sApp Version: ${instance.sAppInfo.version}`);
  }

  if (instance.error) {
    console.log(`  Error:        ${instance.error}`);
  }
}

function formatStrandJson(instance: StrandInstance): object {
  return {
    strandId: instance.strandId,
    status: instance.status,
    latencyHint: instance.latencyHint,
    connectedPeers: instance.connectedPeers,
    lastActivity: instance.lastActivity.toISOString(),
    sAppInfo: instance.sAppInfo,
    error: instance.error,
  };
}

