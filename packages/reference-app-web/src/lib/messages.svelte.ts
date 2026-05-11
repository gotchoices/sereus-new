/**
 * messages.svelte.ts — Svelte 5 runes store around `@optimystic/demo`'s
 * `MessageApp`.
 *
 * The store owns the `MessageApp` lifecycle and exposes reactive `messages`
 * and `activity` arrays plus a `loading`/`error` flag. The UI calls
 * `ensureReady()` once a transactor is available; mutations call
 * `addMessage` / `updateMessage` / `deleteMessage` and the store refreshes
 * the cached state from the network after each write.
 *
 * Polling is intentionally cheap: a few seconds while the route is visible.
 * Real-time deltas via gossip or sync subscriptions land in a follow-up.
 */

import { MessageApp, type Activity, type Message } from '@optimystic/demo';
import { getTransactor, getMode, type NodeMode } from './optimystic.js';
import { pushError } from './diagnostics.svelte.js';

const REFRESH_INTERVAL_MS = 4_000;

interface MessagesState {
	ready: boolean;
	loading: boolean;
	error: string | null;
	mode: NodeMode;
	messages: Message[];
	activity: Activity[];
	updatedMs: number | null;
}

const state = $state<MessagesState>({
	ready: false,
	loading: false,
	error: null,
	mode: 'solo',
	messages: [],
	activity: [],
	updatedMs: null,
});

let app: MessageApp | null = null;
let attachedTransactor: ReturnType<typeof getTransactor> = null;
let pollHandle: ReturnType<typeof setInterval> | null = null;
let visibilityListener: (() => void) | null = null;
let refreshInFlight = false;

export function messagesState(): MessagesState {
	return state;
}

/**
 * Idempotently create / attach the `MessageApp` against the current
 * transactor. If the transactor has changed since the last call (e.g. the
 * user toggled between solo and distributed mode) the app is rebuilt against
 * the new transactor and the cached state is cleared.
 *
 * Safe to call from `onMount` on every route — it's cheap when nothing
 * changed.
 */
export async function ensureReady(): Promise<void> {
	const transactor = getTransactor();
	if (!transactor) {
		// Transactor not available yet — the node hasn't started. Reset so the UI
		// shows a clear "node not running" state.
		app = null;
		attachedTransactor = null;
		state.ready = false;
		state.messages = [];
		state.activity = [];
		state.mode = getMode();
		return;
	}
	state.mode = getMode();
	if (app && attachedTransactor === transactor) {
		return;
	}
	state.loading = true;
	state.error = null;
	try {
		app = await MessageApp.create(transactor);
		attachedTransactor = transactor;
		state.ready = true;
		await refresh();
	} catch (err) {
		state.error = err instanceof Error ? err.message : String(err);
		state.ready = false;
		app = null;
		attachedTransactor = null;
		pushError('MessageApp.create', err);
		console.error('[reference-app-web] MessageApp.create failed:', err);
	} finally {
		state.loading = false;
	}
}

export async function refresh(): Promise<void> {
	if (!app || refreshInFlight) return;
	refreshInFlight = true;
	try {
		const [messages, activity] = await Promise.all([
			app.listMessages(),
			app.getActivity(),
		]);
		state.messages = messages;
		// Activity is naturally append-only; render newest first per ticket.
		state.activity = [...activity].reverse();
		state.error = null;
		state.updatedMs = Date.now();
	} catch (err) {
		state.error = err instanceof Error ? err.message : String(err);
		pushError('messages.refresh', err);
	} finally {
		refreshInFlight = false;
	}
}

export async function addMessage(author: string, content: string): Promise<void> {
	const current = app;
	if (!current) throw new Error('MessageApp not ready');
	state.loading = true;
	state.error = null;
	try {
		await current.addMessage(author, content);
		await refresh();
	} catch (err) {
		state.error = err instanceof Error ? err.message : String(err);
		pushError('messages.add', err);
		throw err;
	} finally {
		state.loading = false;
	}
}

export async function updateMessage(id: string, content: string): Promise<void> {
	const current = app;
	if (!current) throw new Error('MessageApp not ready');
	state.loading = true;
	state.error = null;
	try {
		await current.updateMessage(id, content);
		await refresh();
	} catch (err) {
		state.error = err instanceof Error ? err.message : String(err);
		pushError('messages.update', err);
		throw err;
	} finally {
		state.loading = false;
	}
}

export async function deleteMessage(id: string): Promise<void> {
	const current = app;
	if (!current) throw new Error('MessageApp not ready');
	state.loading = true;
	state.error = null;
	try {
		await current.deleteMessage(id);
		await refresh();
	} catch (err) {
		state.error = err instanceof Error ? err.message : String(err);
		pushError('messages.delete', err);
		throw err;
	} finally {
		state.loading = false;
	}
}

/**
 * Visibility-gated polling for cross-tab convergence. Cheap by design — each
 * tick fans out to two collection reads (Tree + Diary). Stops automatically
 * when the route component unmounts via `stopPolling`.
 */
export function startPolling(): void {
	if (pollHandle) return;
	const tick = () => {
		void refresh();
	};
	const begin = () => {
		if (pollHandle) return;
		tick();
		pollHandle = setInterval(tick, REFRESH_INTERVAL_MS);
	};
	const pause = () => {
		if (!pollHandle) return;
		clearInterval(pollHandle);
		pollHandle = null;
	};
	visibilityListener = () => {
		if (document.visibilityState === 'visible') begin();
		else pause();
	};
	document.addEventListener('visibilitychange', visibilityListener);
	if (document.visibilityState === 'visible') begin();
}

export function stopPolling(): void {
	if (pollHandle) {
		clearInterval(pollHandle);
		pollHandle = null;
	}
	if (visibilityListener) {
		document.removeEventListener('visibilitychange', visibilityListener);
		visibilityListener = null;
	}
}

/**
 * Drop any cached state. Called from the node lifecycle when the libp2p node
 * is stopped — the `MessageApp` is bound to a specific transactor, so a
 * teardown must invalidate the cache.
 */
export function resetMessageApp(): void {
	app = null;
	attachedTransactor = null;
	state.ready = false;
	state.messages = [];
	state.activity = [];
	state.error = null;
	state.updatedMs = null;
}
