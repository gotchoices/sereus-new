import { describe, it, expect } from 'vitest';
import { EnrollmentService, type AuthorityVerifier, type PeerRegistry } from '../src/enrollment.js';
import type { PeerRegistration } from '../src/types.js';

describe('EnrollmentService', () => {
  describe('createCadrePeer', () => {
    it('should generate a new peer identity', async () => {
      const enrollment = new EnrollmentService();
      const result = await enrollment.createCadrePeer();

      expect(result.peerId).toBeDefined();
      expect(typeof result.peerId.toString()).toBe('string');
      expect(result.privateKey).toBeInstanceOf(Uint8Array);
      expect(result.privateKey.length).toBeGreaterThan(0);
    });

    it('should generate unique peer IDs', async () => {
      const enrollment = new EnrollmentService();
      const result1 = await enrollment.createCadrePeer();
      const result2 = await enrollment.createCadrePeer();

      expect(result1.peerId.toString()).not.toBe(result2.peerId.toString());
    });

    it('should generate Ed25519 keys', async () => {
      const enrollment = new EnrollmentService();
      const result = await enrollment.createCadrePeer();

      // Ed25519 peer IDs start with "12D3KooW" in base58btc
      const peerIdStr = result.peerId.toString();
      expect(peerIdStr.startsWith('12D3KooW')).toBe(true);
    });
  });

  describe('registerCadrePeer', () => {
    it('should reject registration without authority verifier', async () => {
      const enrollment = new EnrollmentService();
      const registration: PeerRegistration = {
        peerId: '12D3KooWTestPeerId',
        bootstrapNodes: [],
        authorityKey: 'test-authority',
        signature: 'test-signature'
      };

      await expect(enrollment.registerCadrePeer(registration)).rejects.toThrow('AuthorityVerifier not configured');
    });

    it('should reject registration without peer registry', async () => {
      const mockVerifier: AuthorityVerifier = {
        verifyAuthority: async () => true
      };

      const enrollment = new EnrollmentService({
        authorityVerifier: mockVerifier
      });

      const registration: PeerRegistration = {
        peerId: '12D3KooWTestPeerId',
        bootstrapNodes: [],
        authorityKey: 'test-authority',
        signature: 'test-signature'
      };

      await expect(enrollment.registerCadrePeer(registration)).rejects.toThrow('PeerRegistry not configured');
    });

    it('should reject registration with invalid signature', async () => {
      const mockVerifier: AuthorityVerifier = {
        verifyAuthority: async () => false
      };
      const mockRegistry: PeerRegistry = {
        registerPeer: async () => {}
      };

      const enrollment = new EnrollmentService({
        authorityVerifier: mockVerifier,
        peerRegistry: mockRegistry
      });

      const registration: PeerRegistration = {
        peerId: '12D3KooWTestPeerId',
        bootstrapNodes: [],
        authorityKey: 'test-authority',
        signature: 'invalid-signature'
      };

      await expect(enrollment.registerCadrePeer(registration)).rejects.toThrow('Invalid authority signature');
    });

    it('should register peer with valid signature', async () => {
      let registeredPeerId: string | null = null;

      const mockVerifier: AuthorityVerifier = {
        verifyAuthority: async () => true
      };
      const mockRegistry: PeerRegistry = {
        registerPeer: async (peerId) => { registeredPeerId = peerId; }
      };

      const enrollment = new EnrollmentService({
        authorityVerifier: mockVerifier,
        peerRegistry: mockRegistry
      });

      const registration: PeerRegistration = {
        peerId: '12D3KooWTestPeerId',
        bootstrapNodes: ['/ip4/127.0.0.1/tcp/4001'],
        authorityKey: 'test-authority',
        signature: 'valid-signature'
      };

      await enrollment.registerCadrePeer(registration);
      expect(registeredPeerId).toBe('12D3KooWTestPeerId');
    });
  });

  describe('validateRegistration', () => {
    it('should return false without authority verifier', async () => {
      const enrollment = new EnrollmentService();
      const registration: PeerRegistration = {
        peerId: '12D3KooWTestPeerId',
        bootstrapNodes: [],
        authorityKey: 'test-authority',
        signature: 'test-signature'
      };

      const isValid = await enrollment.validateRegistration(registration);
      expect(isValid).toBe(false);
    });

    it('should return result from verifier', async () => {
      const mockVerifier: AuthorityVerifier = {
        verifyAuthority: async () => true
      };

      const enrollment = new EnrollmentService({
        authorityVerifier: mockVerifier
      });

      const registration: PeerRegistration = {
        peerId: '12D3KooWTestPeerId',
        bootstrapNodes: [],
        authorityKey: 'test-authority',
        signature: 'test-signature'
      };

      const isValid = await enrollment.validateRegistration(registration);
      expect(isValid).toBe(true);
    });
  });
});

