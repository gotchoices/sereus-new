import debug from 'debug';
import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import type { Libp2p } from '@libp2p/interface';
import type {
  OpenInvitation,
  FormStrandResult,
  ValidateFormationResult,
  StrandFormationDisclosure
} from './types.js';

const log = debug('sereus:cadre:solicitation');

/**
 * Interface for validating formation disclosures
 */
export interface DisclosureValidator {
  /**
   * Validate the disclosure provided by an initiator
   * @param token The invitation token
   * @param disclosure The disclosure object from the initiator
   * @returns Whether the disclosure is acceptable
   */
  validateDisclosure(token: string, disclosure: StrandFormationDisclosure): Promise<boolean>;
}

/**
 * Interface for recording formation usage
 */
export interface FormationUsageRecorder {
  /**
   * Record that a formation invite was used
   */
  recordUsage(token: string, initiatorKey: string, strandId: string): Promise<void>;

  /**
   * Check if a token has already been used (for single-use invites)
   */
  isTokenUsed(token: string): Promise<boolean>;

  /**
   * Check if a token is valid and not expired
   */
  isTokenValid(token: string): Promise<{ valid: boolean; invitation?: OpenInvitation }>;
}

/**
 * Interface for strand provisioning during formation
 */
export interface StrandProvisioner {
  /**
   * Provision a new strand after formation is validated
   */
  provisionStrand(
    sAppId: string,
    initiatorKey: string,
    responderKey: string
  ): Promise<{ strandId: string }>;
}

/**
 * Interface for signing formation approvals
 */
export interface FormationSigner {
  /**
   * Sign a formation approval
   */
  signFormation(token: string, disclosure: StrandFormationDisclosure): Promise<{
    validationKey: string;
    validationSignature: string;
  }>;
}

export interface StrandSolicitationServiceOptions {
  disclosureValidator?: DisclosureValidator;
  formationUsageRecorder?: FormationUsageRecorder;
  strandProvisioner?: StrandProvisioner;
  formationSigner?: FormationSigner;
}

/**
 * Strand Solicitation API for forming strands via open invitations.
 * 
 * This service handles the high-level API defined in api.md:
 * - formStrand(token, disclosure) - called by initiator
 * - validateStrandFormation(token, disclosure) - called by responder
 * 
 * The underlying protocol is handled by strand-proto's SessionManager.
 */
export class StrandSolicitationService {
  private readonly disclosureValidator?: DisclosureValidator;
  private readonly formationUsageRecorder?: FormationUsageRecorder;
  private readonly strandProvisioner?: StrandProvisioner;
  private readonly formationSigner?: FormationSigner;

  constructor(options?: StrandSolicitationServiceOptions) {
    this.disclosureValidator = options?.disclosureValidator;
    this.formationUsageRecorder = options?.formationUsageRecorder;
    this.strandProvisioner = options?.strandProvisioner;
    this.formationSigner = options?.formationSigner;
    log('StrandSolicitationService created');
  }

  /**
   * Form a strand with a responder via an open invitation.
   * 
   * Called by the initiator (the party who received an out-of-band invitation).
   * This generates a member key, contacts the responder's cadre, and negotiates
   * strand formation.
   * 
   * @param token The invitation token from the OpenInvitation
   * @param disclosure Identity/context information to share with the responder
   * @returns The member key and strand info if successful
   */
  async formStrand(
    token: string,
    disclosure: StrandFormationDisclosure
  ): Promise<FormStrandResult> {
    log('Forming strand with token: %s', token);

    // Generate a new keypair for this strand membership
    const privateKey = await generateKeyPair('Ed25519');
    const peerId = peerIdFromPrivateKey(privateKey);
    const privateKeyBytes = privateKeyToProtobuf(privateKey);

    const memberKey = peerId.toString();
    const invitePrivateKey = Buffer.from(privateKeyBytes).toString('base64');

    log('Generated member key: %s', memberKey);

    // In a full implementation, this would:
    // 1. Look up bootstrap addresses from the token
    // 2. Connect to responder's cadre via strand-proto
    // 3. Exchange disclosure for validation
    // 4. Receive strand provisioning result
    // 
    // For now, we return the generated keys - the actual protocol
    // negotiation happens via strand-proto's SessionManager.initiateBootstrap()

    // Placeholder strandId - in reality this comes from the responder
    const strandId = `strand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      memberKey,
      invitePrivateKey,
      strandId
    };
  }

  /**
   * Validate a strand formation request.
   *
   * Called by the responder (the party who created the open invitation) when
   * an initiator contacts them to form a strand. Validates the disclosure
   * and returns a signed approval.
   *
   * @param token The invitation token being used
   * @param disclosure The disclosure from the initiator
   * @returns Validation key and signature if approved
   * @throws If validation fails or token is invalid
   */
  async validateStrandFormation(
    token: string,
    disclosure: StrandFormationDisclosure
  ): Promise<ValidateFormationResult> {
    log('Validating strand formation for token: %s', token);

    // Check token validity
    if (this.formationUsageRecorder) {
      const tokenCheck = await this.formationUsageRecorder.isTokenValid(token);
      if (!tokenCheck.valid) {
        log('Token invalid or expired: %s', token);
        throw new Error('Invalid or expired token');
      }

      // Check if already used (for single-use tokens)
      const isUsed = await this.formationUsageRecorder.isTokenUsed(token);
      if (isUsed) {
        log('Token already used: %s', token);
        throw new Error('Token has already been used');
      }
    }

    // Validate the disclosure
    if (this.disclosureValidator) {
      const isValid = await this.disclosureValidator.validateDisclosure(token, disclosure);
      if (!isValid) {
        log('Disclosure validation failed for token: %s', token);
        throw new Error('Disclosure validation failed');
      }
    }

    // Sign the formation approval
    if (!this.formationSigner) {
      throw new Error('FormationSigner not configured');
    }

    const { validationKey, validationSignature } = await this.formationSigner.signFormation(
      token,
      disclosure
    );

    log('Formation validated, key: %s', validationKey);

    return {
      validationKey,
      validationSignature
    };
  }

  /**
   * Create an open invitation for others to form strands with this party.
   *
   * @param sAppId The sApp to use for formed strands
   * @param expirationMs How long the invitation is valid (ms from now)
   * @param bootstrap Bootstrap addresses for contacting this party's cadre
   * @returns The open invitation to share out-of-band
   */
  async createOpenInvitation(
    sAppId: string,
    expirationMs: number,
    bootstrap: string[]
  ): Promise<OpenInvitation> {
    // Generate a unique token
    const token = `invite-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const expiration = new Date(Date.now() + expirationMs);

    log('Created open invitation: %s (expires %s)', token, expiration.toISOString());

    return {
      token,
      sAppId,
      expiration,
      bootstrap
    };
  }

  /**
   * Record that a formation was completed successfully.
   * Called after strand provisioning to track usage.
   */
  async recordFormationComplete(
    token: string,
    initiatorKey: string,
    strandId: string
  ): Promise<void> {
    if (this.formationUsageRecorder) {
      await this.formationUsageRecorder.recordUsage(token, initiatorKey, strandId);
      log('Recorded formation usage: token=%s strand=%s', token, strandId);
    }
  }
}

