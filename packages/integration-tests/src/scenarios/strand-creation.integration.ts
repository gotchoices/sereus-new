/**
 * Strand creation integration test.
 * 
 * Tests creating strands in a party's control network and verifying
 * they sync across the cadre's nodes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestCadreNetwork, waitUntil, sleep } from '../harness/index.js';
import { MINIMAL_SAPP_LOGIC } from '../fixtures/index.js';

describe('Strand Creation', () => {
  let network: TestCadreNetwork;

  beforeAll(() => {
    network = new TestCadreNetwork({ verbose: true });
  });

  afterAll(async () => {
    await network.shutdown();
  });

  it('should create a strand record in the test network', async () => {
    const alice = await network.createParty({ name: 'alice-strand' });
    
    // Create a strand using the test harness
    const strand = await network.createStrand(alice, {
      schema: MINIMAL_SAPP_LOGIC,
      type: 'o'
    });
    
    expect(strand.strandId).toMatch(/^strand-/);
    expect(strand.sAppId).toBe(alice.authorityPublicKey);
    expect(strand.type).toBe('o');
    expect(strand.parties).toContain(alice.partyId);
  });

  it('should create multiple strands for the same party', async () => {
    const bob = await network.createParty({ name: 'bob-strand' });
    
    const strand1 = await network.createStrand(bob, {
      schema: MINIMAL_SAPP_LOGIC,
      type: 'o'
    });

    const strand2 = await network.createStrand(bob, {
      schema: MINIMAL_SAPP_LOGIC,
      type: 'c'
    });
    
    expect(strand1.strandId).not.toBe(strand2.strandId);
    expect(strand1.type).toBe('o');
    expect(strand2.type).toBe('c');
  });

  it('should create an invitation for a strand', async () => {
    const carol = await network.createParty({ name: 'carol-strand' });
    
    const strand = await network.createStrand(carol, {
      schema: MINIMAL_SAPP_LOGIC
    });
    
    const invitation = await network.createInvitation(carol, strand);
    
    expect(invitation.token).toMatch(/^invite-/);
    expect(invitation.strandId).toBe(strand.strandId);
    expect(invitation.sAppId).toBe(strand.sAppId);
    expect(invitation.bootstrap).toEqual(carol.bootstrapAddrs);
    expect(invitation.expiration.getTime()).toBeGreaterThan(Date.now());
  });

  it('should allow a party to join a strand via invitation', async () => {
    const dave = await network.createParty({ name: 'dave-strand' });
    const eve = await network.createParty({ name: 'eve-strand' });
    
    // Dave creates a strand
    const strand = await network.createStrand(dave, {
      schema: MINIMAL_SAPP_LOGIC
    });
    
    // Dave creates an invitation
    const invitation = await network.createInvitation(dave, strand);
    
    // Eve joins via the invitation
    await network.joinStrand(eve, invitation);
    
    // Verify Eve is now in the strand's parties list
    expect(strand.parties).toContain(dave.partyId);
    expect(strand.parties).toContain(eve.partyId);
  });

  it('should track strand with custom sAppId', async () => {
    const frank = await network.createParty({ name: 'frank-strand' });
    
    const customSAppId = 'custom-sapp-12345';
    const strand = await network.createStrand(frank, {
      schema: MINIMAL_SAPP_LOGIC,
      sAppId: customSAppId
    });
    
    expect(strand.sAppId).toBe(customSAppId);
  });
});

