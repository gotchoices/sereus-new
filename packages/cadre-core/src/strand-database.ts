import debug from 'debug';
import { Database, registerPlugin } from '@quereus/quereus';
import cryptoPlugin from '@optimystic/quereus-plugin-crypto/plugin';
import optimysticPlugin from '@optimystic/quereus-plugin-optimystic/plugin';
import type { Libp2p } from '@libp2p/interface';
import type { IRepo } from '@optimystic/db-core';
import type { SAppConfig } from './types.js';

const log = debug('sereus:cadre:strand-db');

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

export interface StrandDatabaseConfig {
  /** The strand ID */
  strandId: string;
  /** sApp configuration containing the schema */
  sAppConfig: SAppConfig;
  /** Libp2p node for the strand network */
  libp2pNode: Libp2p;
  /** Coordinated repo from the libp2p node */
  coordinatedRepo: IRepo;
}

/**
 * StrandDatabase manages the sApp schema for a strand using Quereus with Optimystic backend.
 * Each strand instance has its own isolated database with the sApp's schema applied.
 */
export class StrandDatabase {
  private db: Database | null = null;
  private collectionFactory: CollectionFactory | null = null;
  private readonly config: StrandDatabaseConfig;
  private initialized = false;

  constructor(config: StrandDatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize the database - register plugins and execute sApp schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log('StrandDatabase for strand %s already initialized', this.config.strandId);
      return;
    }

    log('Initializing StrandDatabase for strand: %s (sApp: %s v%s)',
      this.config.strandId,
      this.config.sAppConfig.id,
      this.config.sAppConfig.version
    );

    // Create database instance
    this.db = new Database();

    // Register crypto plugin (provides digest, sign, verify functions)
    await registerPlugin(this.db, cryptoPlugin);
    log('Registered crypto plugin');

    // Register optimystic plugin with network transactor as default
    const networkName = `strand-${this.config.strandId}`;
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

    // Set optimystic as the default virtual table module so that
    // `declare schema` tables (which omit USING) are backed by optimystic
    // instead of the built-in memory module.
    this.db.setDefaultVtabName('optimystic');
    this.db.setDefaultVtabArgs({
      networkName,
      transactor: 'network',
      keyNetwork: 'libp2p',
    });
    log('Set default vtab to optimystic (networkName=%s)', networkName);

    // Execute the sApp schema DDL
    await this.executeSchema();

    this.initialized = true;
    log('StrandDatabase for strand %s initialized successfully', this.config.strandId);
  }

  private async executeSchema(): Promise<void> {
    const rawSchema = this.config.sAppConfig.schema;
    log('Applying sApp schema for strand %s', this.config.strandId);

    // Wrap the raw schema DDL in a declarative schema block and apply it.
    // This ensures proper schema management with diff/apply semantics.
    // The schema is applied to a named schema 'App' to keep it isolated.
    const wrappedSchema = `
      declare schema App {
        ${rawSchema}
      }
      apply schema App;
    `;

    await this.db!.exec(wrappedSchema);
    log('sApp schema applied to strand %s', this.config.strandId);
  }

  /**
   * Get the underlying database for queries
   */
  getDatabase(): Database {
    this.ensureInitialized();
    return this.db!;
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
    log('StrandDatabase for strand %s closed', this.config.strandId);
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error(`StrandDatabase for strand ${this.config.strandId} not initialized. Call initialize() first.`);
    }
  }
}

