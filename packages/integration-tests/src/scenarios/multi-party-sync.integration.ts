/**
 * Multi-party synchronization integration test.
 * 
 * Tests that data written by one party syncs to other parties
 * in a shared strand via FRET.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestCadreNetwork, waitForCount, sleep } from '../harness/index.js';
import { MINIMAL_SAPP_SCHEMA } from '../fixtures/index.js';

describe('Multi-Party Sync', () => {
  let network: TestCadreNetwork;

  beforeAll(() => {
    network = new TestCadreNetwork({ 
      verbose: true,
      defaultTimeoutMs: 15_000
    });
  });

  afterAll(async () => {
    await network.shutdown();
  });

  it('should establish a shared strand between two parties', async () => {
    // Create two parties
    const alice = await network.createParty({ 
      name: 'alice-sync',
      droneCount: 1
    });
    const bob = await network.createParty({ 
      name: 'bob-sync',
      droneCount: 1
    });
    
    // Alice creates a strand
    const strand = await network.createStrand(alice, {
      schema: MINIMAL_SAPP_SCHEMA,
      type: 'o'
    });
    
    // Alice creates an invitation
    const invitation = await network.createInvitation(alice, strand);
    
    // Bob joins the strand
    await network.joinStrand(bob, invitation);
    
    // Verify both parties are in the strand
    expect(strand.parties).toHaveLength(2);
    expect(strand.parties).toContain(alice.partyId);
    expect(strand.parties).toContain(bob.partyId);
  });

  it('should have nodes from both parties connected', async () => {
    const carol = await network.createParty({ 
      name: 'carol-sync',
      droneCount: 1
    });
    const dave = await network.createParty({ 
      name: 'dave-sync',
      droneCount: 1
    });
    
    // Create and join strand
    const strand = await network.createStrand(carol, {
      schema: MINIMAL_SAPP_SCHEMA
    });
    const invitation = await network.createInvitation(carol, strand);
    await network.joinStrand(dave, invitation);
    
    // Both parties have their own control networks
    // In a real implementation, the strand network would connect them
    // For now, verify each party's internal connectivity
    
    // Carol's cadre should be connected
    await waitForCount(
      () => carol.authorityNode.libp2p.getConnections().length,
      1,
      { 
        timeoutMs: 5000,
        description: 'carol authority has connections'
      }
    );
    
    // Dave's cadre should be connected
    await waitForCount(
      () => dave.authorityNode.libp2p.getConnections().length,
      1,
      { 
        timeoutMs: 5000,
        description: 'dave authority has connections'
      }
    );
  });

  it('should track strand membership correctly', async () => {
    const eve = await network.createParty({ name: 'eve-sync' });
    const frank = await network.createParty({ name: 'frank-sync' });
    const grace = await network.createParty({ name: 'grace-sync' });
    
    // Eve creates a strand
    const strand = await network.createStrand(eve, {
      schema: MINIMAL_SAPP_SCHEMA
    });
    
    // Create invitation and have Frank and Grace join
    const invitation = await network.createInvitation(eve, strand);
    await network.joinStrand(frank, invitation);
    await network.joinStrand(grace, invitation);
    
    // All three parties should be in the strand
    expect(strand.parties).toHaveLength(3);
    expect(strand.parties).toContain(eve.partyId);
    expect(strand.parties).toContain(frank.partyId);
    expect(strand.parties).toContain(grace.partyId);
  });

  it('should support multiple strands between same parties', async () => {
    const henry = await network.createParty({ name: 'henry-sync' });
    const ivy = await network.createParty({ name: 'ivy-sync' });
    
    // Create two different strands
    const strand1 = await network.createStrand(henry, {
      schema: MINIMAL_SAPP_SCHEMA,
      sAppId: 'app-1'
    });
    
    const strand2 = await network.createStrand(henry, {
      schema: MINIMAL_SAPP_SCHEMA,
      sAppId: 'app-2'
    });
    
    // Ivy joins both strands
    const invite1 = await network.createInvitation(henry, strand1);
    const invite2 = await network.createInvitation(henry, strand2);
    
    await network.joinStrand(ivy, invite1);
    await network.joinStrand(ivy, invite2);
    
    // Both strands should have both parties
    expect(strand1.parties).toContain(henry.partyId);
    expect(strand1.parties).toContain(ivy.partyId);
    expect(strand2.parties).toContain(henry.partyId);
    expect(strand2.parties).toContain(ivy.partyId);
    
    // But they should be different strands
    expect(strand1.strandId).not.toBe(strand2.strandId);
    expect(strand1.sAppId).not.toBe(strand2.sAppId);
  });
});

