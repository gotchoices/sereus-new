<script lang="ts">
	import { copyToClipboard } from './diagnostics.svelte.js';

	interface Props {
		value: string;
		label?: string;
	}

	const { value, label }: Props = $props();
	let copied = $state(false);
	let resetTimer: ReturnType<typeof setTimeout> | null = null;

	async function onCopy() {
		const ok = await copyToClipboard(value);
		copied = ok;
		if (resetTimer) clearTimeout(resetTimer);
		resetTimer = setTimeout(() => {
			copied = false;
			resetTimer = null;
		}, 1200);
	}
</script>

<span class="copyable">
	<code>{label ?? value}</code>
	<button type="button" onclick={onCopy} aria-label="Copy" title={value}>
		{copied ? 'copied' : 'copy'}
	</button>
</span>

<style>
	.copyable {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		max-width: 100%;
	}
	code {
		font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
		font-size: 0.85rem;
		word-break: break-all;
		background: #eef0f4;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
	}
	button {
		font-size: 0.7rem;
		padding: 0.0625rem 0.375rem;
		border: 1px solid #d4d6db;
		border-radius: 0.25rem;
		background: white;
		color: #4a4d54;
		cursor: pointer;
		font-family: inherit;
	}
	button:hover {
		background: #f4f5f7;
	}
</style>
