/**
 * Svelte 5 runes-based store wrapping the libp2p singleton.
 *
 * Exposes peer ID, status, mode (solo vs distributed), and any startup error
 * to the UI layer so components can stay declarative. Solo mode boots on app
 * start; distributed mode is triggered by the Network panel handing over a
 * bootstrap multiaddr.
 */

import {
	startNode,
	stopNode,
	getNode,
	getMode,
	type NodeMode,
} from './optimystic.js';
import { pushError } from './diagnostics.svelte.js';

export type NodeStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

interface NodeState {
	status: NodeStatus;
	peerId: string | null;
	error: string | null;
	mode: NodeMode;
}

const state = $state<NodeState>({
	status: 'idle',
	peerId: null,
	error: null,
	mode: 'solo',
});

export function nodeState(): NodeState {
	return state;
}

export async function start(bootstrapNodes: string[] = []): Promise<void> {
	if (state.status === 'starting' || state.status === 'running') return;
	state.status = 'starting';
	state.error = null;
	try {
		const node = await startNode({ bootstrapNodes });
		state.peerId = node.peerId.toString();
		state.mode = getMode();
		state.status = 'running';
	} catch (err) {
		state.error = err instanceof Error ? err.message : String(err);
		state.status = 'error';
		pushError('startNode', err);
		console.error('[reference-app-web] startNode failed:', err);
	}
}

export async function stop(): Promise<void> {
	if (state.status !== 'running') return;
	try {
		await stopNode();
		state.peerId = null;
		state.status = 'stopped';
		state.mode = 'solo';
	} catch (err) {
		state.error = err instanceof Error ? err.message : String(err);
		state.status = 'error';
		pushError('stopNode', err);
		console.error('[reference-app-web] stopNode failed:', err);
	}
}

/**
 * Restart the node with a new set of bootstrap multiaddrs. Empty array → solo.
 * Single-shot helper for the Network panel; idempotent across rapid toggles
 * because `start` early-returns when a node is already running.
 */
export async function restart(bootstrapNodes: string[]): Promise<void> {
	if (state.status === 'running') {
		await stop();
	}
	await start(bootstrapNodes);
}

export function currentPeerId(): string | null {
	const node = getNode();
	return node ? node.peerId.toString() : null;
}
