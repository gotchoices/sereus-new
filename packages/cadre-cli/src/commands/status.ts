import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';

export const statusCommand = new Command('status')
  .description('Show control network and strand status')
  .option('-c, --config <path>', 'Path to config file (YAML or JSON)', 'cadre.yaml')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    // Status requires connecting to a running node or reading state from disk
    // For now, we show a basic status based on config and any cached state

    const configPath = path.resolve(options.config);
    if (!fs.existsSync(configPath)) {
      console.error(`Config file not found: ${configPath}`);
      console.log('\nTo start a cadre node, run:');
      console.log('  cadre start -c <config-file>');
      process.exit(1);
    }

    // Read basic config info
    const { loadConfigFile } = await import('../config/loader.js');
    const config = await loadConfigFile(options.config);

    const status = {
      config: options.config,
      partyId: config.controlNetwork.partyId,
      profile: config.profile,
      bootstrapNodes: config.controlNetwork.bootstrapNodes.length,
      strandFilter: config.strandFilter ?? 'all',
      hibernation: config.hibernation?.enabled ?? false,
      // These would come from runtime state - not available in static status
      running: false,
      peerId: null as string | null,
      strands: [] as string[],
    };

    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log('Cadre Node Status');
      console.log('─────────────────────────────────────────');
      console.log(`Config:          ${status.config}`);
      console.log(`Party ID:        ${status.partyId}`);
      console.log(`Profile:         ${status.profile}`);
      console.log(`Bootstrap Nodes: ${status.bootstrapNodes}`);
      console.log(`Strand Filter:   ${JSON.stringify(status.strandFilter)}`);
      console.log(`Hibernation:     ${status.hibernation ? 'enabled' : 'disabled'}`);
      console.log('');
      console.log('Note: Run "cadre start" to see live runtime status.');
    }
  });

