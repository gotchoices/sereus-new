import { describe, it, expect } from 'vitest';
import {
  StrandSolicitationService,
  type DisclosureValidator,
  type FormationUsageRecorder,
  type FormationSigner
} from '../src/strand-solicitation.js';
import type { StrandFormationDisclosure, OpenInvitation } from '../src/types.js';

describe('StrandSolicitationService', () => {
  describe('formStrand', () => {
    it('should generate member key and private key', async () => {
      const service = new StrandSolicitationService();
      const disclosure: StrandFormationDisclosure = {
        partyId: 'party-123',
        purpose: 'Test strand formation'
      };

      const result = await service.formStrand('test-token', disclosure);

      expect(result.memberKey).toBeDefined();
      expect(result.memberKey.startsWith('12D3KooW')).toBe(true); // Ed25519 peer ID
      expect(result.invitePrivateKey).toBeDefined();
      expect(result.invitePrivateKey.length).toBeGreaterThan(0);
      expect(result.strandId).toBeDefined();
      expect(result.strandId.startsWith('strand-')).toBe(true);
    });

    it('should generate unique keys for each call', async () => {
      const service = new StrandSolicitationService();
      const disclosure: StrandFormationDisclosure = { partyId: 'party-123' };

      const result1 = await service.formStrand('token-1', disclosure);
      const result2 = await service.formStrand('token-2', disclosure);

      expect(result1.memberKey).not.toBe(result2.memberKey);
      expect(result1.strandId).not.toBe(result2.strandId);
    });
  });

  describe('validateStrandFormation', () => {
    it('should throw without formationSigner', async () => {
      const service = new StrandSolicitationService();
      const disclosure: StrandFormationDisclosure = { partyId: 'party-123' };

      await expect(service.validateStrandFormation('token', disclosure))
        .rejects.toThrow('FormationSigner not configured');
    });

    it('should throw for invalid token', async () => {
      const mockRecorder: FormationUsageRecorder = {
        recordUsage: async () => {},
        isTokenUsed: async () => false,
        isTokenValid: async () => ({ valid: false })
      };
      const mockSigner: FormationSigner = {
        signFormation: async () => ({ validationKey: 'key', validationSignature: 'sig' })
      };

      const service = new StrandSolicitationService({
        formationUsageRecorder: mockRecorder,
        formationSigner: mockSigner
      });

      await expect(service.validateStrandFormation('bad-token', {}))
        .rejects.toThrow('Invalid or expired token');
    });

    it('should throw for already-used token', async () => {
      const mockRecorder: FormationUsageRecorder = {
        recordUsage: async () => {},
        isTokenUsed: async () => true,
        isTokenValid: async () => ({ valid: true })
      };
      const mockSigner: FormationSigner = {
        signFormation: async () => ({ validationKey: 'key', validationSignature: 'sig' })
      };

      const service = new StrandSolicitationService({
        formationUsageRecorder: mockRecorder,
        formationSigner: mockSigner
      });

      await expect(service.validateStrandFormation('used-token', {}))
        .rejects.toThrow('Token has already been used');
    });

    it('should throw for failed disclosure validation', async () => {
      const mockValidator: DisclosureValidator = {
        validateDisclosure: async () => false
      };
      const mockSigner: FormationSigner = {
        signFormation: async () => ({ validationKey: 'key', validationSignature: 'sig' })
      };

      const service = new StrandSolicitationService({
        disclosureValidator: mockValidator,
        formationSigner: mockSigner
      });

      await expect(service.validateStrandFormation('token', { partyId: 'bad-party' }))
        .rejects.toThrow('Disclosure validation failed');
    });

    it('should return validation result for valid formation', async () => {
      const mockSigner: FormationSigner = {
        signFormation: async () => ({
          validationKey: 'validation-key-123',
          validationSignature: 'signature-abc'
        })
      };

      const service = new StrandSolicitationService({
        formationSigner: mockSigner
      });

      const result = await service.validateStrandFormation('valid-token', { partyId: 'party-1' });

      expect(result.validationKey).toBe('validation-key-123');
      expect(result.validationSignature).toBe('signature-abc');
    });
  });

  describe('createOpenInvitation', () => {
    it('should create invitation with correct fields', async () => {
      const service = new StrandSolicitationService();
      const bootstrap = ['/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWTest'];

      const invitation = await service.createOpenInvitation('sapp-123', 3600000, bootstrap);

      expect(invitation.token).toBeDefined();
      expect(invitation.token.startsWith('invite-')).toBe(true);
      expect(invitation.sAppId).toBe('sapp-123');
      expect(invitation.bootstrap).toEqual(bootstrap);
      expect(invitation.expiration).toBeInstanceOf(Date);
      expect(invitation.expiration.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('recordFormationComplete', () => {
    it('should call recorder when available', async () => {
      let recorded: { token: string; initiatorKey: string; strandId: string } | null = null;

      const mockRecorder: FormationUsageRecorder = {
        recordUsage: async (token, initiatorKey, strandId) => {
          recorded = { token, initiatorKey, strandId };
        },
        isTokenUsed: async () => false,
        isTokenValid: async () => ({ valid: true })
      };

      const service = new StrandSolicitationService({
        formationUsageRecorder: mockRecorder
      });

      await service.recordFormationComplete('token-1', 'key-1', 'strand-1');

      expect(recorded).toEqual({
        token: 'token-1',
        initiatorKey: 'key-1',
        strandId: 'strand-1'
      });
    });

    it('should not throw without recorder', async () => {
      const service = new StrandSolicitationService();

      await expect(service.recordFormationComplete('t', 'k', 's')).resolves.not.toThrow();
    });
  });
});

