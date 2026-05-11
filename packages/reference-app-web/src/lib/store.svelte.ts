/**
 * Svelte 5 runes-based store wrapping the libp2p singleton.
 *
 * Exposes peer ID, status, and any startup error to the UI layer so the
 * App component can stay declarative.
 */

import { startNode, stopNode, getNode } from './optimystic.js';
import { pushError } from './diagnostics.svelte.js';

export type NodeStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

interface NodeState {
	status: NodeStatus;
	peerId: string | null;
	error: string | null;
}

const state = $state<NodeState>({
	status: 'idle',
	peerId: null,
	error: null,
});

export function nodeState(): NodeState {
	return state;
}

export async function start(): Promise<void> {
	if (state.status === 'starting' || state.status === 'running') return;
	state.status = 'starting';
	state.error = null;
	try {
		const node = await startNode();
		state.peerId = node.peerId.toString();
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
	} catch (err) {
		state.error = err instanceof Error ? err.message : String(err);
		state.status = 'error';
		pushError('stopNode', err);
		console.error('[reference-app-web] stopNode failed:', err);
	}
}

export function currentPeerId(): string | null {
	const node = getNode();
	return node ? node.peerId.toString() : null;
}
