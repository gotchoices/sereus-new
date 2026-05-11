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
import {
	IndexedDBRawStorage,
	openOptimysticWebDb,
	loadOrCreateBrowserPeerKey,
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

let node: Libp2p | null = null;
let db: OptimysticWebDBHandle | null = null;

export function getNode(): Libp2p | null {
	return node;
}

export async function startNode(opts: StartNodeOptions = {}): Promise<Libp2p> {
	if (node) return node;

	const networkName = opts.networkName ?? DEFAULT_NETWORK_NAME;
	const bootstrapNodes = opts.bootstrapNodes ?? [];

	db = await openOptimysticWebDb(networkName);
	const privateKey = await loadOrCreateBrowserPeerKey(db);
	const storage = new IndexedDBRawStorage(db);

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
}
