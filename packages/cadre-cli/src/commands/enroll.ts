import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import debug from 'debug';
import { EnrollmentService } from '@serfab/cadre-core';
import { toString as uint8ArrayToString } from 'uint8arrays';

const log = debug('cadre:cli:enroll');

export const enrollCommand = new Command('enroll')
  .description('Enroll a new peer in the cadre')
  .addCommand(
    new Command('create')
      .description('Create a new peer identity (generate keypair)')
      .option('-o, --output <path>', 'Output directory for key files', '.')
      .option('--name <name>', 'Name prefix for key files', 'cadre-peer')
      .action(async (options) => {
        console.log('Creating new peer identity...');
        log('Output directory: %s', options.output);

        const enrollment = new EnrollmentService();
        const result = await enrollment.createCadrePeer();

        const peerId = result.peerId.toString();
        const privateKeyHex = uint8ArrayToString(result.privateKey, 'hex');

        // Save to files
        const outputDir = path.resolve(options.output);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const keyPath = path.join(outputDir, `${options.name}.key`);
        const idPath = path.join(outputDir, `${options.name}.id`);

        fs.writeFileSync(keyPath, privateKeyHex, 'utf-8');
        fs.chmodSync(keyPath, 0o600); // Restrict permissions
        fs.writeFileSync(idPath, peerId, 'utf-8');

        console.log('✓ Peer identity created');
        console.log(`  Peer ID:      ${peerId}`);
        console.log(`  Private key:  ${keyPath}`);
        console.log(`  ID file:      ${idPath}`);
        console.log('');
        console.log('Next steps:');
        console.log('1. Have an authority sign this peer ID to authorize it');
        console.log('2. Run "cadre enroll register" with the signature');
      })
  )
  .addCommand(
    new Command('register')
      .description('Register a peer with the control network (requires authority signature)')
      .requiredOption('-p, --peer-id <id>', 'Peer ID to register')
      .requiredOption('-b, --bootstrap <addrs...>', 'Bootstrap node multiaddrs')
      .requiredOption('-a, --authority-key <key>', 'Authority public key that signed')
      .requiredOption('-s, --signature <sig>', 'Signature from authority')
      .option('-c, --config <path>', 'Config file for node settings', 'cadre.yaml')
      .action(async (options) => {
        console.log('Registering peer with control network...');
        log('Peer ID: %s', options.peerId);
        log('Bootstrap nodes: %o', options.bootstrap);

        // Create enrollment service with custom verifier
        const enrollment = new EnrollmentService();

        // Validate the registration data format
        // Note: Without an AuthorityVerifier, we can only check the format
        const registration = {
          peerId: options.peerId,
          bootstrapNodes: options.bootstrap,
          authorityKey: options.authorityKey,
          signature: options.signature,
        };

        // Basic validation of the inputs
        if (!registration.peerId || registration.peerId.length < 10) {
          console.error('✗ Invalid peer ID format');
          process.exit(1);
        }

        if (!registration.bootstrapNodes || registration.bootstrapNodes.length === 0) {
          console.error('✗ At least one bootstrap node is required');
          process.exit(1);
        }

        if (!registration.authorityKey || registration.authorityKey.length < 10) {
          console.error('✗ Invalid authority key format');
          process.exit(1);
        }

        if (!registration.signature || registration.signature.length < 10) {
          console.error('✗ Invalid signature format');
          process.exit(1);
        }

        console.log('✓ Registration data format is valid');
        console.log(`  Peer ID:     ${registration.peerId}`);
        console.log(`  Authority:   ${registration.authorityKey.substring(0, 20)}...`);
        console.log(`  Bootstrap:   ${registration.bootstrapNodes.length} node(s)`);
        console.log('');
        console.log('To complete registration, the authority must submit this');
        console.log('registration to the control network from an authorized node.');
        console.log('');
        console.log('Then start the node with:');
        console.log(`  cadre start -c ${options.config}`);
      })
  );

