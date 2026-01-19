/**
 * TestParty factory for integration tests.
 *
 * Creates parties with authority nodes and optional drone nodes,
 * all using real libp2p networking and real ControlDatabase.
 */

import debug from 'debug';
import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { createLibp2pNode } from '@optimystic/db-p2p';
import { ControlDatabase } from '@sereus/cadre-core';
import type { Libp2p } from '@libp2p/interface';
import type { IRepo } from '@optimystic/db-core';
import { allocatePort, releasePorts } from './port-allocator.js';
import type { TestParty, TestCadreNode, CreatePartyOptions } from './types.js';

const log = debug('sereus:integration:party');

/**
 * Extended Libp2p node with coordinatedRepo attached by createLibp2pNode.
 */
interface Libp2pNodeWithRepo extends Libp2p {
  coordinatedRepo: IRepo;
}

/**
 * Create a test cadre node with real libp2p networking
 */
async function createTestNode(
  networkName: string,
  bootstrapNodes: string[],
  profile: 'transaction' | 'storage'
): Promise<TestCadreNode> {
  const port = await allocatePort();

  log('Creating node on port %d for network %s', port, networkName);

  const node = await createLibp2pNode({
    port,
    bootstrapNodes,
    networkName,
    storageType: 'memory',
    fretProfile: profile === 'storage' ? 'core' : 'edge',
    clusterSize: 3,
    clusterPolicy: {
      allowDownsize: true,
      sizeTolerance: 0.5,
      superMajorityThreshold: 0.51
    },
    arachnode: { enableRingZulu: true }
  }) as Libp2pNodeWithRepo;

  const multiaddrs = node.getMultiaddrs().map(ma => ma.toString());
  const peerId = node.peerId.toString();

  log('Node created: %s listening on %j', peerId, multiaddrs);

  return {
    libp2p: node,
    peerId,
    port,
    multiaddrs,
    profile,
    coordinatedRepo: node.coordinatedRepo
  };
}

/**
 * Create a test party with authority node and optional drones
 */
export async function createTestParty(options: CreatePartyOptions): Promise<TestParty> {
  const { name, droneCount = 0, droneProfile = 'storage' } = options;
  
  // Generate unique party ID
  const partyId = `party-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const networkName = `control-${partyId}`;
  
  log('Creating test party: %s (id: %s)', name, partyId);
  
  // Generate authority keypair
  const authorityKey = await generateKeyPair('Ed25519');
  const authorityPrivateKey = privateKeyToProtobuf(authorityKey);
  const authorityPeerId = peerIdFromPrivateKey(authorityKey);
  // Use the peer ID string as the public key identifier (base58btc encoded)
  const authorityPublicKey = authorityPeerId.toString();

  log('Generated authority key: %s', authorityPublicKey);
  
  // Create authority node first (no bootstrap - it IS the bootstrap)
  const authorityNode = await createTestNode(networkName, [], 'transaction');
  
  // Get bootstrap addresses from authority node
  const bootstrapAddrs = authorityNode.multiaddrs;
  
  // Create drone nodes if requested
  const droneNodes: TestCadreNode[] = [];
  for (let i = 0; i < droneCount; i++) {
    log('Creating drone node %d/%d for party %s', i + 1, droneCount, name);
    const drone = await createTestNode(networkName, bootstrapAddrs, droneProfile);
    droneNodes.push(drone);
  }
  
  log('Party %s created with %d total nodes', name, 1 + droneNodes.length);

  // Create and initialize the ControlDatabase for this party
  const controlDatabase = new ControlDatabase({
    partyId,
    libp2pNode: authorityNode.libp2p,
    coordinatedRepo: authorityNode.coordinatedRepo
  });
  await controlDatabase.initialize();
  log('ControlDatabase initialized for party %s', name);

  // Bootstrap: insert the authority key
  await controlDatabase.insertAuthorityKey(authorityPublicKey);
  log('Authority key inserted for party %s', name);

  return {
    partyId,
    name,
    authorityPrivateKey,
    authorityPublicKey,
    authorityNode,
    droneNodes,
    bootstrapAddrs,
    controlDatabase
  };
}

/**
 * Shut down a test party and release resources
 */
export async function shutdownTestParty(party: TestParty): Promise<void> {
  log('Shutting down party: %s', party.name);

  // Close the ControlDatabase first
  try {
    await party.controlDatabase.close();
    log('ControlDatabase closed for party %s', party.name);
  } catch (err) {
    log('Error closing ControlDatabase for %s: %s', party.name, (err as Error).message);
  }

  const allNodes = [party.authorityNode, ...party.droneNodes];
  const ports: number[] = [];

  for (const node of allNodes) {
    try {
      await node.libp2p.stop();
      ports.push(node.port);
    } catch (err) {
      log('Error stopping node %s: %s', node.peerId, (err as Error).message);
    }
  }

  releasePorts(ports);
  log('Party %s shutdown complete', party.name);
}

