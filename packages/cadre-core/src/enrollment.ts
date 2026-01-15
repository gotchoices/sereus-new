import debug from 'debug';
import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import type { CreatePeerResult, PeerRegistration } from './types.js';

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
 * Enrollment API for adding new cadre peers
 * 
 * Phase 1: Peer Creation - New node generates keypair locally
 * Phase 2: Registration - Authority signs the peer into control network
 */
export class EnrollmentService {
  private readonly authorityVerifier?: AuthorityVerifier;
  private readonly peerRegistry?: PeerRegistry;

  constructor(options?: {
    authorityVerifier?: AuthorityVerifier;
    peerRegistry?: PeerRegistry;
  }) {
    this.authorityVerifier = options?.authorityVerifier;
    this.peerRegistry = options?.peerRegistry;
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
}

