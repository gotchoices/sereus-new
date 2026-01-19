import debug from 'debug';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Database, registerPlugin } from '@quereus/quereus';
import cryptoPlugin from '@optimystic/quereus-plugin-crypto/plugin';
import optimysticPlugin from '@optimystic/quereus-plugin-optimystic/plugin';
import { digest, randomBytes } from '@optimystic/quereus-plugin-crypto';
import type { Libp2p } from '@libp2p/interface';
import type { IRepo } from '@optimystic/db-core';
import type { StrandRow } from './types.js';

const log = debug('sereus:cadre:control-db');

/**
 * Generate a unique stamp ID for transaction authorization.
 * Format: 32 bytes base64url encoded
 * - First 16 bytes: SHA-256 hash of peer ID (for distributed uniqueness)
 * - Last 16 bytes: Random bytes (for collision resistance)
 */
function generateStampId(peerId: string): string {
  // Hash the peer ID and get first 16 bytes (128 bits)
  const peerIdHash = digest(peerId, 'sha256', 'utf8', 'bytes') as Uint8Array;
  const peerIdHashPart = peerIdHash.slice(0, 16);

  // Generate 16 random bytes
  const randomPart = randomBytes(128, 'bytes') as Uint8Array;

  // Combine peer ID hash and random bytes
  const combined = new Uint8Array(32);
  combined.set(peerIdHashPart, 0);
  combined.set(randomPart, 16);

  // Convert to base64url
  return Buffer.from(combined).toString('base64url');
}

/**
 * Minimal interface for the CollectionFactory returned by the optimystic plugin.
 * We only need the methods we actually use.
 */
interface CollectionFactory {
  registerLibp2pNode(networkName: string, node: Libp2p, coordinatedRepo: IRepo): void;
  shutdown(): Promise<void>;
}

/** Result of registering the optimystic plugin */
interface OptimysticPluginResult {
  collectionFactory: CollectionFactory;
  vtables: Array<{ name: string; module: unknown; auxData: unknown }>;
  functions: Array<{ schema: unknown }>;
  [key: string]: unknown;
}

export interface ControlDatabaseConfig {
  /** Party ID for the control network */
  partyId: string;
  /** Path to the control schema file (defaults to bundled schema) */
  schemaPath?: string;
  /** Libp2p node for the control network (injected) */
  libp2pNode: Libp2p;
  /** Coordinated repo from the libp2p node */
  coordinatedRepo: IRepo;
}

/**
 * ControlDatabase manages the CadreControl schema using Quereus with Optimystic backend.
 * It provides typed query methods for accessing control network data.
 */
export class ControlDatabase {
  private db: Database | null = null;
  private collectionFactory: CollectionFactory | null = null;
  private readonly config: ControlDatabaseConfig;
  private initialized = false;

  constructor(config: ControlDatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize the database - load schema and register plugins
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log('ControlDatabase already initialized');
      return;
    }

    log('Initializing ControlDatabase for party: %s', this.config.partyId);

    // Create database instance
    this.db = new Database();

    // Register crypto plugin (provides digest, sign, verify functions)
    await registerPlugin(this.db, cryptoPlugin);
    log('Registered crypto plugin');

    // Register optimystic plugin with network transactor as default
    const networkName = `control-${this.config.partyId}`;
    const pluginResult = optimysticPlugin(this.db, {
      default_transactor: 'network',
      default_key_network: 'libp2p',
      default_network_name: networkName,
      enable_cache: true,
    }) as OptimysticPluginResult;

    // Register vtables and functions manually since we need access to collectionFactory
    for (const vtable of pluginResult.vtables as Array<{ name: string; module: unknown; auxData: unknown }>) {
      this.db.registerModule(vtable.name, vtable.module as any, vtable.auxData);
    }
    for (const func of pluginResult.functions as Array<{ schema: unknown }>) {
      this.db.registerFunction(func.schema as any);
    }

    this.collectionFactory = pluginResult.collectionFactory;

    // Inject the libp2p node into the collection factory
    this.collectionFactory.registerLibp2pNode(
      networkName,
      this.config.libp2pNode,
      this.config.coordinatedRepo
    );
    log('Registered libp2p node with collection factory');

    // Load and execute the schema
    await this.loadSchema();

    this.initialized = true;
    log('ControlDatabase initialized successfully');
  }

  private async loadSchema(): Promise<void> {
    const schemaPath = this.config.schemaPath ?? this.getDefaultSchemaPath();
    log('Loading schema from: %s', schemaPath);

    const schemaContent = await readFile(schemaPath, 'utf-8');
    await this.db!.exec(schemaContent);
    log('Schema loaded and executed');
  }

  private getDefaultSchemaPath(): string {
    // Resolve path relative to the package root
    const currentDir = dirname(fileURLToPath(import.meta.url));
    // Go up from dist/src or src to package root, then up to repo root, then to schemas/
    return resolve(currentDir, '..', '..', '..', 'schemas', 'control.qsql');
  }

  /**
   * Query all strands from the control database
   */
  async queryStrands(): Promise<StrandRow[]> {
    this.ensureInitialized();
    const results: StrandRow[] = [];
    for await (const row of this.db!.eval('select Id, MemberPrivateKey, Type from CadreControl.Strand')) {
      results.push({
        Id: row.Id as string,
        MemberPrivateKey: row.MemberPrivateKey as string | null,
        Type: row.Type as 'o' | 'c',
      });
    }
    return results;
  }

  /**
   * Get the underlying database for advanced queries
   */
  getDatabase(): Database {
    this.ensureInitialized();
    return this.db!;
  }

  /**
   * Insert the initial authority key (bootstrap - no existing authorities required)
   */
  async insertAuthorityKey(key: string): Promise<void> {
    this.ensureInitialized();
    log('Inserting authority key: %s', key);

    // For bootstrap, context values are not verified since no existing authorities
    // Use fully qualified table name since schema is CadreControl
    // StampId() provides the transaction's unique stamp from the optimystic transaction
    await this.db!.exec(`
      insert into CadreControl.AuthorityKey (Key)
        with context AuthorityKey = null, Signature = null, StampId = StampId()
        values ('${key}')
    `);
    log('Authority key inserted');
  }

  /**
   * Insert a strand into the control database using authority signature.
   * This starts a transaction, gets the StampId, signs it, and inserts the strand.
   *
   * @param strandId - Unique identifier for the strand
   * @param type - Strand type: 'o' for open, 'c' for closed
   * @param authorityKey - Public key of the authorizing authority
   * @param signStampId - Function to sign the stamp ID with the authority's private key
   * @param memberPrivateKey - Optional private key for membership in closed strands
   */
  async insertStrand(
    strandId: string,
    type: 'o' | 'c',
    authorityKey: string,
    signStampId: (stampId: string) => string,
    memberPrivateKey?: string
  ): Promise<void> {
    this.ensureInitialized();
    log('Inserting strand: %s (type: %s)', strandId, type);

    const memberKeyValue = memberPrivateKey ? `'${memberPrivateKey}'` : 'null';

    // Generate a unique stamp ID using the peer ID for distributed uniqueness
    const peerId = this.config.libp2pNode.peerId.toString();
    const stampId = generateStampId(peerId);

    // Sign the stamp ID with the authority key
    const signature = signStampId(stampId);

    // Insert with the signed stamp ID
    await this.db!.exec(`
      insert into CadreControl.Strand (Id, Type, MemberPrivateKey)
        with context AuthorityKey = '${authorityKey}', Signature = '${signature}', StampId = '${stampId}'
        values ('${strandId}', '${type}', ${memberKeyValue})
    `);

    log('Strand inserted: %s', strandId);
  }

  /**
   * Close the database and cleanup resources
   */
  async close(): Promise<void> {
    if (this.collectionFactory) {
      await this.collectionFactory.shutdown();
      this.collectionFactory = null;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    log('ControlDatabase closed');
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('ControlDatabase not initialized. Call initialize() first.');
    }
  }
}

