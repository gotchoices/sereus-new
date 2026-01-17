import { describe, it, expect } from 'vitest';
import {
  EnrollmentService,
  type AuthorityVerifier,
  type PeerRegistry,
  type MemberVerifier,
  type MemberRegistry
} from '../src/enrollment.js';
import type { PeerRegistration, MemberRegistration } from '../src/types.js';

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

  describe('registerMember', () => {
    const createMemberRegistration = (): MemberRegistration => ({
      strandId: 'strand-123',
      key: 'member-key-abc',
      peerIds: ['12D3KooWPeer1', '12D3KooWPeer2']
    });

    it('should fail without memberVerifier', async () => {
      const enrollment = new EnrollmentService();
      const result = await enrollment.registerMember(createMemberRegistration(), 'sig');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('MemberVerifier not configured');
    });

    it('should fail without memberRegistry', async () => {
      const mockVerifier: MemberVerifier = {
        verifyMember: async () => true,
        isAuthorizedToJoin: async () => true
      };

      const enrollment = new EnrollmentService({ memberVerifier: mockVerifier });
      const result = await enrollment.registerMember(createMemberRegistration(), 'sig');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('MemberRegistry not configured');
    });

    it('should fail with invalid signature', async () => {
      const mockVerifier: MemberVerifier = {
        verifyMember: async () => false,
        isAuthorizedToJoin: async () => true
      };
      const mockRegistry: MemberRegistry = {
        registerMember: async () => {},
        isMemberRegistered: async () => false
      };

      const enrollment = new EnrollmentService({
        memberVerifier: mockVerifier,
        memberRegistry: mockRegistry
      });

      const result = await enrollment.registerMember(createMemberRegistration(), 'bad-sig');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Invalid signature');
    });

    it('should fail if not authorized to join', async () => {
      const mockVerifier: MemberVerifier = {
        verifyMember: async () => true,
        isAuthorizedToJoin: async () => false
      };
      const mockRegistry: MemberRegistry = {
        registerMember: async () => {},
        isMemberRegistered: async () => false
      };

      const enrollment = new EnrollmentService({
        memberVerifier: mockVerifier,
        memberRegistry: mockRegistry
      });

      const result = await enrollment.registerMember(createMemberRegistration(), 'sig');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Not authorized to join strand');
    });

    it('should fail if already registered', async () => {
      const mockVerifier: MemberVerifier = {
        verifyMember: async () => true,
        isAuthorizedToJoin: async () => true
      };
      const mockRegistry: MemberRegistry = {
        registerMember: async () => {},
        isMemberRegistered: async () => true
      };

      const enrollment = new EnrollmentService({
        memberVerifier: mockVerifier,
        memberRegistry: mockRegistry
      });

      const result = await enrollment.registerMember(createMemberRegistration(), 'sig');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Member already registered');
    });

    it('should successfully register member', async () => {
      let registeredData: { strandId: string; key: string; peerIds: string[] } | null = null;

      const mockVerifier: MemberVerifier = {
        verifyMember: async () => true,
        isAuthorizedToJoin: async () => true
      };
      const mockRegistry: MemberRegistry = {
        registerMember: async (strandId, key, peerIds) => {
          registeredData = { strandId, key, peerIds };
        },
        isMemberRegistered: async () => false
      };

      const enrollment = new EnrollmentService({
        memberVerifier: mockVerifier,
        memberRegistry: mockRegistry
      });

      const registration = createMemberRegistration();
      const result = await enrollment.registerMember(registration, 'valid-sig');

      expect(result.success).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(registeredData).toEqual({
        strandId: 'strand-123',
        key: 'member-key-abc',
        peerIds: ['12D3KooWPeer1', '12D3KooWPeer2']
      });
    });
  });

  describe('validateMemberRegistration', () => {
    const createMemberRegistration = (): MemberRegistration => ({
      strandId: 'strand-123',
      key: 'member-key-abc',
      peerIds: ['12D3KooWPeer1']
    });

    it('should return invalid without memberVerifier', async () => {
      const enrollment = new EnrollmentService();
      const result = await enrollment.validateMemberRegistration(createMemberRegistration(), 'sig');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('MemberVerifier not configured');
    });

    it('should return invalid without memberRegistry', async () => {
      const mockVerifier: MemberVerifier = {
        verifyMember: async () => true,
        isAuthorizedToJoin: async () => true
      };

      const enrollment = new EnrollmentService({ memberVerifier: mockVerifier });
      const result = await enrollment.validateMemberRegistration(createMemberRegistration(), 'sig');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('MemberRegistry not configured');
    });

    it('should return valid for good registration', async () => {
      const mockVerifier: MemberVerifier = {
        verifyMember: async () => true,
        isAuthorizedToJoin: async () => true
      };
      const mockRegistry: MemberRegistry = {
        registerMember: async () => {},
        isMemberRegistered: async () => false
      };

      const enrollment = new EnrollmentService({
        memberVerifier: mockVerifier,
        memberRegistry: mockRegistry
      });

      const result = await enrollment.validateMemberRegistration(createMemberRegistration(), 'sig');

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });
});

