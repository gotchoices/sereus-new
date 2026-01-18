/**
 * TestCadreNetwork - orchestrator for multi-party integration tests.
 * 
 * Manages multiple parties, their cadres, strand creation, invitations,
 * and provides utilities for waiting on convergence and executing queries.
 */

import debug from 'debug';
import { createTestParty, shutdownTestParty } from './test-party.js';
import { releaseAllPorts } from './port-allocator.js';
import { waitUntil, waitForCount, sleep } from './wait-utils.js';
import type {
  TestParty,
  TestStrand,
  TestOpenInvitation,
  CreatePartyOptions,
  CreateStrandOptions,
  QueryResult
} from './types.js';

const log = debug('sereus:integration:network');

/**
 * Options for TestCadreNetwork
 */
export interface TestNetworkOptions {
  /** Default timeout for wait operations (ms) */
  defaultTimeoutMs?: number;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Main orchestrator for integration tests.
 * Creates parties, manages strands, and provides query utilities.
 */
export class TestCadreNetwork {
  private readonly parties = new Map<string, TestParty>();
  private readonly strands = new Map<string, TestStrand>();
  private readonly options: Required<TestNetworkOptions>;
  private isShutdown = false;

  constructor(options: TestNetworkOptions = {}) {
    this.options = {
      defaultTimeoutMs: options.defaultTimeoutMs ?? 10_000,
      verbose: options.verbose ?? false
    };
    log('TestCadreNetwork created');
  }

  /**
   * Create a new party with its cadre
   */
  async createParty(options: CreatePartyOptions | string): Promise<TestParty> {
    const opts = typeof options === 'string' ? { name: options } : options;
    
    log('Creating party: %s', opts.name);
    const party = await createTestParty(opts);
    this.parties.set(party.partyId, party);
    
    log('Party created: %s (partyId: %s)', party.name, party.partyId);
    return party;
  }

  /**
   * Get a party by name
   */
  getPartyByName(name: string): TestParty | undefined {
    for (const party of this.parties.values()) {
      if (party.name === name) return party;
    }
    return undefined;
  }

  /**
   * Create a strand in a party's control network
   */
  async createStrand(party: TestParty, options: CreateStrandOptions): Promise<TestStrand> {
    const strandId = `strand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sAppId = options.sAppId ?? party.authorityPublicKey;
    
    log('Creating strand %s for party %s', strandId, party.name);
    
    // TODO: Actually insert into control network via ControlDatabase
    // For now, create the strand record
    const strand: TestStrand = {
      strandId,
      sAppId,
      schema: options.schema,
      type: options.type ?? 'o',
      parties: [party.partyId]
    };
    
    this.strands.set(strandId, strand);
    log('Strand created: %s', strandId);
    
    return strand;
  }

  /**
   * Create an open invitation for a strand
   */
  async createInvitation(
    party: TestParty,
    strand: TestStrand,
    expirationMs: number = 300_000
  ): Promise<TestOpenInvitation> {
    const token = `invite-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    
    log('Creating invitation for strand %s from party %s', strand.strandId, party.name);
    
    // TODO: Insert into FormationInvite table via ControlDatabase
    const invitation: TestOpenInvitation = {
      token,
      sAppId: strand.sAppId,
      strandId: strand.strandId,
      expiration: new Date(Date.now() + expirationMs),
      bootstrap: party.bootstrapAddrs
    };
    
    log('Invitation created: %s', token);
    return invitation;
  }

  /**
   * Join a strand via invitation
   */
  async joinStrand(
    joiner: TestParty,
    invitation: TestOpenInvitation
  ): Promise<void> {
    log('Party %s joining strand %s via invitation', joiner.name, invitation.strandId);
    
    const strand = this.strands.get(invitation.strandId);
    if (!strand) {
      throw new Error(`Strand ${invitation.strandId} not found`);
    }
    
    // TODO: Implement actual strand joining:
    // 1. Insert FormationUsage record
    // 2. Insert Strand row in joiner's control network
    // 3. Wait for strand instance to start
    
    strand.parties.push(joiner.partyId);
    log('Party %s joined strand %s', joiner.name, invitation.strandId);
  }

  /**
   * Wait for control network sync across a party's nodes
   */
  async waitForControlSync(
    party: TestParty,
    table: string,
    expectedRows: number,
    timeoutMs?: number
  ): Promise<void> {
    log('Waiting for control sync: %s.%s >= %d rows', party.name, table, expectedRows);
    
    // TODO: Query each node's control database and wait for convergence
    await sleep(100); // Placeholder
    
    log('Control sync complete for %s.%s', party.name, table);
  }

  /**
   * Shutdown all parties and release resources
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) return;
    
    log('Shutting down TestCadreNetwork with %d parties', this.parties.size);
    
    for (const party of this.parties.values()) {
      await shutdownTestParty(party);
    }
    
    this.parties.clear();
    this.strands.clear();
    releaseAllPorts();
    this.isShutdown = true;
    
    log('TestCadreNetwork shutdown complete');
  }
}

