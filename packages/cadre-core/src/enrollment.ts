import debug from 'debug';
import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import type {
  CreatePeerResult,
  PeerRegistration,
  MemberRegistration,
  MemberRegistrationResult
} from './types.js';

const log = debug('sereus:cadre:enrollment');

/**
 * Interface for verifying signatures against authority keys
 */
export interface AuthorityVerifier {
  /**
   * Verify a signature against the AuthorityKey table
   * @param digest The data that was signed
   * @param signature The signature to verify
   * @param authorityKey The public key to verify against
   * @returns true if the signature is valid and the key is authorized
   */
  verifyAuthority(digest: Uint8Array, signature: string, authorityKey: string): Promise<boolean>;
}

/**
 * Interface for registering peers in the control network
 */
export interface PeerRegistry {
  /**
   * Register a peer in the CadrePeer table
   */
  registerPeer(peerId: string, multiaddr: string | null): Promise<void>;
}

/**
 * Interface for verifying member signatures for strand joining
 */
export interface MemberVerifier {
  /**
   * Verify that the signature is valid for the given member registration
   * @param registration The member registration data
   * @param signature The signature to verify
   * @returns true if signature is valid
   */
  verifyMember(registration: MemberRegistration, signature: string): Promise<boolean>;

  /**
   * Check if the member key is authorized to join the strand
   * (e.g., was invited via FormationInvite)
   */
  isAuthorizedToJoin(strandId: string, memberKey: string): Promise<boolean>;
}

/**
 * Interface for registering members in a strand
 */
export interface MemberRegistry {
  /**
   * Register a member in the strand's member list
   */
  registerMember(strandId: string, memberKey: string, peerIds: string[]): Promise<void>;

  /**
   * Check if a member is already registered in the strand
   */
  isMemberRegistered(strandId: string, memberKey: string): Promise<boolean>;
}

/**
 * Enrollment API for adding new cadre peers and members
 *
 * Cadre Peer Authorization:
 *   Phase 1: Peer Creation - New node generates keypair locally
 *   Phase 2: Registration - Authority signs the peer into control network
 *
 * Member Registration:
 *   Accept invitations to join strands as a member
 */
export class EnrollmentService {
  private readonly authorityVerifier?: AuthorityVerifier;
  private readonly peerRegistry?: PeerRegistry;
  private readonly memberVerifier?: MemberVerifier;
  private readonly memberRegistry?: MemberRegistry;

  constructor(options?: {
    authorityVerifier?: AuthorityVerifier;
    peerRegistry?: PeerRegistry;
    memberVerifier?: MemberVerifier;
    memberRegistry?: MemberRegistry;
  }) {
    this.authorityVerifier = options?.authorityVerifier;
    this.peerRegistry = options?.peerRegistry;
    this.memberVerifier = options?.memberVerifier;
    this.memberRegistry = options?.memberRegistry;
    log('EnrollmentService created');
  }

  /**
   * Phase 1: Create a new cadre peer identity
   * 
   * Generates a new Ed25519 keypair for a cadre node.
   * The private key should be stored securely by the node.
   * The PeerId is returned to be signed by an authority.
   */
  async createCadrePeer(): Promise<CreatePeerResult> {
    log('Creating new cadre peer identity');
    
    // Generate Ed25519 keypair (same as libp2p uses)
    const privateKey = await generateKeyPair('Ed25519');
    const peerId = peerIdFromPrivateKey(privateKey);
    
    // Export private key as protobuf bytes for storage
    const privateKeyBytes = privateKeyToProtobuf(privateKey);
    
    log('Created peer with ID: %s', peerId.toString());
    
    return {
      peerId,
      privateKey: privateKeyBytes
    };
  }

  /**
   * Phase 2: Register a cadre peer into the control network
   * 
   * Verifies the authority signature and adds the peer to the CadrePeer table.
   * This should be called by an existing cadre node that has access to the
   * control network.
   * 
   * @param registration The peer registration data including authority signature
   * @throws If signature verification fails or peer already exists
   */
  async registerCadrePeer(registration: PeerRegistration): Promise<void> {
    const { peerId, bootstrapNodes, authorityKey, signature } = registration;
    
    log('Registering peer: %s with authority: %s', peerId, authorityKey);

    if (!this.authorityVerifier) {
      throw new Error('AuthorityVerifier not configured - cannot verify registration');
    }

    if (!this.peerRegistry) {
      throw new Error('PeerRegistry not configured - cannot register peer');
    }

    // Create digest from peerId for verification
    const encoder = new TextEncoder();
    const digest = encoder.encode(peerId);

    // Verify the signature against the authority key
    const isValid = await this.authorityVerifier.verifyAuthority(
      digest,
      signature,
      authorityKey
    );

    if (!isValid) {
      log('Signature verification failed for peer: %s', peerId);
      throw new Error('Invalid authority signature');
    }

    log('Signature verified for peer: %s', peerId);

    // Register the peer in the control network
    // Multiaddr will be null initially - peer will update it after joining
    await this.peerRegistry.registerPeer(peerId, null);

    log('Peer %s registered successfully with bootstrap nodes: %o', peerId, bootstrapNodes);
  }

  /**
   * Validate a peer registration without actually registering
   * Useful for pre-flight checks
   */
  async validateRegistration(registration: PeerRegistration): Promise<boolean> {
    const { peerId, authorityKey, signature } = registration;

    if (!this.authorityVerifier) {
      return false;
    }

    const encoder = new TextEncoder();
    const digest = encoder.encode(peerId);

    try {
      return await this.authorityVerifier.verifyAuthority(digest, signature, authorityKey);
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Member Registration API
  // ============================================================================

  /**
   * Register a member into a strand.
   *
   * Called by an invited party to accept an invitation and join as a member.
   * The signature proves ownership of the member key.
   *
   * @param registration The member registration data (strandId, key, peerIds)
   * @param signature Signature over the registration proving key ownership
   * @returns Success/failure with optional reason
   */
  async registerMember(
    registration: MemberRegistration,
    signature: string
  ): Promise<MemberRegistrationResult> {
    const { strandId, key, peerIds } = registration;

    log('Registering member %s for strand %s with %d peers', key, strandId, peerIds.length);

    // Check required dependencies
    if (!this.memberVerifier) {
      log('MemberVerifier not configured');
      return { success: false, reason: 'MemberVerifier not configured' };
    }

    if (!this.memberRegistry) {
      log('MemberRegistry not configured');
      return { success: false, reason: 'MemberRegistry not configured' };
    }

    // Verify the signature
    const isValidSignature = await this.memberVerifier.verifyMember(registration, signature);
    if (!isValidSignature) {
      log('Invalid signature for member registration: %s', key);
      return { success: false, reason: 'Invalid signature' };
    }

    // Check if member is authorized to join (e.g., has a valid invitation)
    const isAuthorized = await this.memberVerifier.isAuthorizedToJoin(strandId, key);
    if (!isAuthorized) {
      log('Member %s not authorized to join strand %s', key, strandId);
      return { success: false, reason: 'Not authorized to join strand' };
    }

    // Check if already registered
    const alreadyRegistered = await this.memberRegistry.isMemberRegistered(strandId, key);
    if (alreadyRegistered) {
      log('Member %s already registered in strand %s', key, strandId);
      return { success: false, reason: 'Member already registered' };
    }

    // Register the member
    try {
      await this.memberRegistry.registerMember(strandId, key, peerIds);
      log('Member %s successfully registered in strand %s', key, strandId);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('Failed to register member %s: %s', key, message);
      return { success: false, reason: `Registration failed: ${message}` };
    }
  }

  /**
   * Validate a member registration without actually registering
   * Useful for pre-flight checks
   */
  async validateMemberRegistration(
    registration: MemberRegistration,
    signature: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const { strandId, key } = registration;

    if (!this.memberVerifier) {
      return { valid: false, reason: 'MemberVerifier not configured' };
    }

    if (!this.memberRegistry) {
      return { valid: false, reason: 'MemberRegistry not configured' };
    }

    // Verify signature
    const isValidSignature = await this.memberVerifier.verifyMember(registration, signature);
    if (!isValidSignature) {
      return { valid: false, reason: 'Invalid signature' };
    }

    // Check authorization
    const isAuthorized = await this.memberVerifier.isAuthorizedToJoin(strandId, key);
    if (!isAuthorized) {
      return { valid: false, reason: 'Not authorized to join strand' };
    }

    // Check if already registered
    const alreadyRegistered = await this.memberRegistry.isMemberRegistered(strandId, key);
    if (alreadyRegistered) {
      return { valid: false, reason: 'Member already registered' };
    }

    return { valid: true };
  }
}

