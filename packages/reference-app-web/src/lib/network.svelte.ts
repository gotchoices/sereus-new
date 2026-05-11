/**
 * network.svelte.ts — connect / disconnect lifecycle for the Network panel.
 *
 * Owns the bootstrap multiaddr input, persists the last-used value to the
 * same IndexedDB instance the libp2p node uses (`kv` object store), and
 * drives the node restart cycle. The Svelte component remains a thin shell
 * over this store.
 *
 * Persistence is handled via `IndexedDBKVStore` rather than `localStorage`
 * so the bootstrap address is namespaced alongside the libp2p identity and
 * survives the same erase-the-IDB-to-reset semantics already documented for
 * the scaffold.
 */

import { IndexedDBKVStore } from '@optimystic/db-p2p-storage-web';
import { restart, stop, nodeState } from './store.svelte.js';
import {
	ensureReady as ensureMessagesReady,
	resetMessageApp,
} from './messages.svelte.js';
import { getDb } from './optimystic.js';
import { pushError } from './diagnostics.svelte.js';

const BOOTSTRAP_KEY = 'last-bootstrap';
const KV_PREFIX = 'optimystic:web-ref:';

interface NetworkState {
	/** Multiaddr currently typed into the panel input. */
	bootstrapInput: string;
	/** Multiaddr we last successfully booted with (drives the input default). */
	lastBootstrap: string | null;
}

const state = $state<NetworkState>({
	bootstrapInput: '',
	lastBootstrap: null,
});

let hydrated = false;

export function networkState(): NetworkState {
	return state;
}

export function setBootstrapInput(value: string): void {
	state.bootstrapInput = value;
}

async function withKvStore<T>(fn: (kv: IndexedDBKVStore) => Promise<T>): Promise<T | undefined> {
	const db = getDb();
	if (!db) return undefined;
	try {
		const kv = new IndexedDBKVStore(db, KV_PREFIX);
		return await fn(kv);
	} catch (err) {
		pushError('network.kv', err);
		return undefined;
	}
}

/**
 * Pull the last-used bootstrap from IndexedDB so the input shows it on a
 * fresh page load. Idempotent — the first solo-mode boot has already opened
 * the IDB connection by the time the Network panel mounts.
 */
export async function hydrate(): Promise<void> {
	if (hydrated) return;
	const stored = await withKvStore((kv) => kv.get(BOOTSTRAP_KEY));
	if (stored && state.bootstrapInput === '') {
		state.bootstrapInput = stored;
		state.lastBootstrap = stored;
	}
	hydrated = true;
}

/**
 * Connect to a bootstrap node — restarts the libp2p node with the parsed
 * multiaddrs and persists the input for next time. Empty / whitespace input
 * is rejected at the UI; this is the lower-level entry point that assumes a
 * non-empty value.
 */
export async function connect(): Promise<void> {
	const addrs = parseMultiaddrs(state.bootstrapInput);
	if (addrs.length === 0) {
		throw new Error('No bootstrap multiaddr provided');
	}
	// Drop the prior MessageApp before swapping transactors — its handles
	// reference the old transactor and would race with the new one.
	resetMessageApp();
	await restart(addrs);
	await withKvStore((kv) => kv.set(BOOTSTRAP_KEY, state.bootstrapInput));
	state.lastBootstrap = state.bootstrapInput;
	// Re-attach the messages store to the new transactor.
	await ensureMessagesReady();
}

/**
 * Drop the network connection and return to solo mode. The bootstrap input
 * is preserved so the user can reconnect with a single click.
 */
export async function disconnect(): Promise<void> {
	resetMessageApp();
	await stop();
	// Auto-restart in solo mode so /messages keeps working without a manual
	// page reload — matches the implicit contract of the existing scaffold.
	await restart([]);
	await ensureMessagesReady();
}

function parseMultiaddrs(raw: string): string[] {
	return raw
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export function isDistributed(): boolean {
	return nodeState().mode === 'distributed';
}
