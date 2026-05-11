/**
 * optimystic.ts — libp2p node configured for a browser peer in solo mode.
 *
 * Mirrors the shape of `reference-app-rn/src/cadre-phone.ts` but for the
 * browser:
 *   - WebSocket + circuit-relay transports (browsers cannot listen)
 *   - IndexedDB-backed raw storage via `@optimystic/db-p2p-storage-web`
 *   - Ed25519 identity persisted across reloads in the same IDB database
 *   - No bootstrap, no listen addresses — pure solo mode for the scaffold
 */

import { createLibp2pNode, type NodeOptions } from '@optimystic/db-p2p/rn';
import type { IRawStorage } from '@optimystic/db-p2p';
import {
	IndexedDBRawStorage,
	openOptimysticWebDb,
	loadOrCreateBrowserPeerKey,
	DEFAULT_PEER_KEY_NAME,
	type OptimysticWebDBHandle,
} from '@optimystic/db-p2p-storage-web';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import type { Libp2p } from 'libp2p';

export interface StartNodeOptions {
	/** Logical network identifier — also used as the IndexedDB database name. */
	networkName?: string;
	/** Bootstrap multiaddrs. Empty in solo mode. */
	bootstrapNodes?: string[];
}

const DEFAULT_NETWORK_NAME = 'sereus-web-reference';
const IDENTITY_FIRST_SEEN_KEY = 'identity-first-seen';

let node: Libp2p | null = null;
let db: OptimysticWebDBHandle | null = null;
let storage: IRawStorage | null = null;
let identityFirstSeenMs: number | null = null;

export function getNode(): Libp2p | null {
	return node;
}

export function getDb(): OptimysticWebDBHandle | null {
	return db;
}

export function getStorage(): IRawStorage | null {
	return storage;
}

/**
 * Wall-clock time (ms since epoch) of the first observed presence of the
 * persisted identity on this device. Set when the key is generated, or on
 * first inspection if a key was already present before the app started
 * tracking. Returns `null` before the node has been started.
 */
export function getIdentityFirstSeenMs(): number | null {
	return identityFirstSeenMs;
}

async function trackIdentityFirstSeen(
	handle: OptimysticWebDBHandle,
	keyName: string,
): Promise<number> {
	const existingKey = await handle.get('kv', keyName);
	const existingFirstSeen = await handle.get('kv', IDENTITY_FIRST_SEEN_KEY);

	if (typeof existingFirstSeen === 'string') {
		const parsed = Number(existingFirstSeen);
		if (Number.isFinite(parsed)) return parsed;
	}

	const now = Date.now();
	await handle.put('kv', String(now), IDENTITY_FIRST_SEEN_KEY);
	// If the key was already present but no first-seen was recorded, this is
	// an upgrade path — "first seen" becomes now, which understates the real
	// age. That's an acceptable diagnostic compromise; the UI doesn't claim
	// the value is the key's true creation time.
	void existingKey;
	return now;
}

export async function startNode(opts: StartNodeOptions = {}): Promise<Libp2p> {
	if (node) return node;

	const networkName = opts.networkName ?? DEFAULT_NETWORK_NAME;
	const bootstrapNodes = opts.bootstrapNodes ?? [];

	db = await openOptimysticWebDb(networkName);
	identityFirstSeenMs = await trackIdentityFirstSeen(db, DEFAULT_PEER_KEY_NAME);
	const privateKey = await loadOrCreateBrowserPeerKey(db);
	storage = new IndexedDBRawStorage(db);

	const config: NodeOptions = {
		privateKey,
		networkName,
		bootstrapNodes,
		clusterSize: 1,
		storage,
		transports: [webSockets(), circuitRelayTransport()],
		listenAddrs: [],
	};

	node = await createLibp2pNode(config);
	return node;
}

export async function stopNode(): Promise<void> {
	if (node) {
		await node.stop();
		node = null;
	}
	if (db) {
		db.close();
		db = null;
	}
	storage = null;
	identityFirstSeenMs = null;
}
