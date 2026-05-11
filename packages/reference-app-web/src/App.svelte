<script lang="ts">
	import { onMount } from 'svelte';
	import { nodeState, start, stop } from './lib/store.svelte.js';

	const state = nodeState();

	onMount(() => {
		void start();
	});

	async function handleRestart() {
		await stop();
		await start();
	}
</script>

<main>
	<header>
		<h1>Sereus Web Reference</h1>
		<span class="mode-badge">Solo</span>
	</header>

	<section class="status">
		<div class="row">
			<span class="label">Status</span>
			<span class="value status-{state.status}">{state.status}</span>
		</div>
		<div class="row">
			<span class="label">Peer ID</span>
			<code class="value peer-id">{state.peerId ?? '—'}</code>
		</div>
		{#if state.error}
			<div class="row error">
				<span class="label">Error</span>
				<span class="value">{state.error}</span>
			</div>
		{/if}
	</section>

	<section class="actions">
		<button onclick={handleRestart} disabled={state.status === 'starting'}>
			Restart node
		</button>
	</section>

	<footer>
		<p>
			Solo mode: no bootstrap, no listen addresses. Identity persists in
			IndexedDB and survives reloads.
		</p>
	</footer>
</main>

<style>
	main {
		max-width: 720px;
		margin: 2rem auto;
		padding: 0 1.25rem;
		font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto,
			sans-serif;
		color: #1d1f24;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.mode-badge {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.125rem 0.5rem;
		border-radius: 999px;
		background: #ffe9b3;
		color: #6b4d00;
	}

	.status {
		display: grid;
		gap: 0.5rem;
		padding: 1rem 1.25rem;
		border: 1px solid #e3e5ea;
		border-radius: 0.5rem;
		background: #fafbfc;
	}

	.row {
		display: grid;
		grid-template-columns: 6rem 1fr;
		gap: 1rem;
		align-items: baseline;
	}

	.label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: #6c6f76;
	}

	.value {
		font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
		font-size: 0.9rem;
		word-break: break-all;
	}

	.peer-id {
		background: #eef0f4;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
	}

	.status-running {
		color: #1f7a3b;
	}
	.status-starting {
		color: #8a5a00;
	}
	.status-error {
		color: #b3261e;
	}
	.status-idle,
	.status-stopped {
		color: #4a4d54;
	}

	.error .value {
		color: #b3261e;
	}

	.actions {
		margin-top: 1.5rem;
	}

	button {
		padding: 0.5rem 1rem;
		font: inherit;
		font-weight: 500;
		border: 1px solid #d4d6db;
		border-radius: 0.375rem;
		background: white;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	footer {
		margin-top: 2rem;
		color: #6c6f76;
		font-size: 0.875rem;
	}
</style>
