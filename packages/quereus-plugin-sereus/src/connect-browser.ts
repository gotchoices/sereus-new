import debug from 'debug';
import type { Database } from '@quereus/quereus';
import cryptoPlugin from '@optimystic/quereus-plugin-crypto/plugin';
import optimysticPlugin from '@optimystic/quereus-plugin-optimystic/plugin';
import { createLibp2pNode } from '@optimystic/db-p2p/rn';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { IndexedDBRawStorage, openOptimysticWebDb } from '@optimystic/db-p2p-storage-web';
import type { Libp2p } from '@libp2p/interface';
import type { IRepo } from '@optimystic/db-core';
import type { IRawStorage } from '@optimystic/db-p2p';
import type { StrandConnectionOptions, SereusPluginResult, Libp2pNodeWithRepo } from './types.js';

const log = debug('sereus:plugin:strand:browser');

/**
 * Minimal interface for the CollectionFactory returned by the optimystic plugin.
 */
interface CollectionFactory {
	registerLibp2pNode(networkName: string, node: Libp2p, coordinatedRepo: IRepo): void;
	shutdown(): Promise<void>;
}

interface OptimysticPluginResult {
	collectionFactory: CollectionFactory;
	vtables: Array<{ name: string; module: unknown; auxData: unknown }>;
	functions: Array<{ schema: unknown }>;
	collations?: Array<{ name: string; func: unknown; normalizer?: unknown }>;
	[key: string]: unknown;
}

interface CryptoPluginResult {
	vtables: Array<{ name: string; module: unknown; auxData: unknown }>;
	functions: Array<{ schema: unknown }>;
	collations: Array<{ name: string; func: unknown; normalizer?: unknown }>;
}

/**
 * Inline equivalent of `@quereus/quereus`'s `registerPlugin` for plugins that
 * only return functions/vtables/collations. Keeps the browser bundle from
 * pulling a duplicate `@quereus/quereus` next to the host's instance.
 */
function applyRegistrations(
	db: Database,
	result: { vtables?: Array<{ name: string; module: unknown; auxData: unknown }>; functions?: Array<{ schema: unknown }>; collations?: Array<{ name: string; func: unknown; normalizer?: unknown }> },
): void {
	for (const vtable of result.vtables ?? []) {
		db.registerModule(vtable.name, vtable.module as any, vtable.auxData);
	}
	for (const func of result.functions ?? []) {
		db.registerFunction(func.schema as any);
	}
	for (const collation of result.collations ?? []) {
		db.registerCollation(collation.name, collation.func as any, collation.normalizer as any);
	}
}

/**
 * Connect a Quereus Database to a Sereus strand from a browser/worker.
 *
 * Same shape as `connectToStrand` but:
 *  - Uses the TCP-free `@optimystic/db-p2p/rn` entry; transports are explicit
 *    (`webSockets()` + `circuitRelayTransport()`).
 *  - Defaults `storage` to `IndexedDBRawStorage` keyed by `sereus-strand-<strandId>`.
 *  - Does not import `@quereus/quereus` at runtime (registrations are applied
 *    against the caller-supplied `db`).
 */
export async function connectToStrandBrowser(
	db: Database,
	options: StrandConnectionOptions,
): Promise<SereusPluginResult> {
	const {
		strandId,
		bootstrapNodes = [],
		schema,
		sAppId: _sAppId = 'unknown',
		sAppVersion: _sAppVersion = '1.0.0',
		enableCache = true,
		fretProfile = 'edge',
		mode,
	} = options;

	let resolvedTransactor: string;
	if (mode !== undefined) {
		resolvedTransactor = mode === 'bootstrap' ? 'local' : 'network';
	} else if (options.transactor !== undefined) {
		resolvedTransactor = options.transactor;
	} else {
		resolvedTransactor = 'network';
	}

	const networkName = `strand-${strandId}`;
	log('Connecting to strand %s (network: %s, mode=%s, transactor=%s)',
		strandId, networkName, mode ?? '(default)', resolvedTransactor);

	// Resolve storage. Browsers always default to IndexedDB so reload survives.
	let resolvedStorage: IRawStorage | undefined = options.storage;
	if (!resolvedStorage && resolvedTransactor !== 'test') {
		const dbHandle = await openOptimysticWebDb(`sereus-strand-${strandId}`);
		resolvedStorage = new IndexedDBRawStorage(dbHandle);
		log('Opened default IndexedDB storage (db=sereus-strand-%s)', strandId);
	}

	// 1. Crypto plugin (digest, sign, verify, etc.) — inline registration.
	const cryptoResult = cryptoPlugin(db, {}) as CryptoPluginResult;
	applyRegistrations(db, cryptoResult);
	log('Registered crypto plugin');

	// 2. Optimystic plugin with transactor defaults. In bootstrap mode with
	// persistent storage, hand the same instance to the plugin so the local
	// transactor persists DML on the host backend (not in-memory).
	const pluginConfig: Record<string, unknown> = {
		default_transactor: resolvedTransactor,
		default_key_network: 'libp2p',
		default_network_name: networkName,
		enable_cache: enableCache,
	};
	if (resolvedTransactor === 'local' && resolvedStorage) {
		pluginConfig.rawStorageFactory = () => resolvedStorage!;
	}
	const pluginResult = optimysticPlugin(
		db,
		pluginConfig as unknown as Parameters<typeof optimysticPlugin>[1],
	) as OptimysticPluginResult;

	applyRegistrations(db, pluginResult);
	log('Registered optimystic vtables and functions');

	const { collectionFactory } = pluginResult;

	let createdNode: Libp2p | null = null;

	try {
		if (resolvedTransactor !== 'test' || options.libp2pNode) {
			let node: Libp2p;
			let coordinatedRepo: IRepo;

			if (options.libp2pNode) {
				node = options.libp2pNode;
				if (!options.coordinatedRepo) {
					throw new Error('coordinatedRepo is required when libp2pNode is provided');
				}
				coordinatedRepo = options.coordinatedRepo;
				log('Using injected libp2p node');
			} else {
				const created = await createLibp2pNode({
					transports: [webSockets(), circuitRelayTransport()],
					listenAddrs: [],
					bootstrapNodes,
					networkName,
					fretProfile,
					...(resolvedStorage && { storage: resolvedStorage }),
				});
				createdNode = created;
				node = created;
				coordinatedRepo = (created as Libp2pNodeWithRepo).coordinatedRepo;
				if (!coordinatedRepo) {
					throw new Error('coordinatedRepo not available on created libp2p node');
				}
				log('Created libp2p node (fretProfile: %s, storage=%s)',
					fretProfile, !!resolvedStorage);
			}

			collectionFactory.registerLibp2pNode(networkName, node, coordinatedRepo);
			log('Registered libp2p node with collection factory');
		}

		db.setDefaultVtabName('optimystic');
		db.setDefaultVtabArgs({
			networkName,
			transactor: resolvedTransactor,
			keyNetwork: 'libp2p',
		});
		log('Set default vtab to optimystic (networkName=%s, transactor=%s)', networkName, resolvedTransactor);

		if (schema) {
			log('Applying sApp schema for strand %s', strandId);
			await db.exec(`
				declare schema App {
					${schema}
				}
				apply schema App;
			`);
			log('sApp schema applied');
		}
	} catch (err) {
		await collectionFactory.shutdown();
		if (createdNode) {
			await createdNode.stop();
		}
		throw err;
	}

	return {
		vtables: [],
		functions: [],
		collations: [],
		async shutdown() {
			log('Shutting down strand connection %s', strandId);
			await collectionFactory.shutdown();
			if (createdNode) {
				await createdNode.stop();
			}
			log('Strand connection %s shut down', strandId);
		},
	};
}
