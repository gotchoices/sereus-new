<script lang="ts">
	import { onMount } from 'svelte';
	import { start } from './lib/store.svelte.js';
	import {
		routeState,
		startRouter,
		stopRouter,
		hrefFor,
	} from './lib/router.svelte.js';
	import Home from './Home.svelte';
	import Diagnostics from './Diagnostics.svelte';

	const route = routeState();

	onMount(() => {
		startRouter();
		void start();
		return () => stopRouter();
	});

	const NAV: Array<{ path: string; label: string }> = [
		{ path: '/', label: 'Home' },
		{ path: '/diag', label: 'Diagnostics' },
	];

	function isActive(path: string): boolean {
		if (path === '/') return route.path === '/';
		return route.path === path || route.path.startsWith(path + '/');
	}
</script>

<main>
	<header>
		<h1>Sereus Web Reference</h1>
		<span class="mode-badge">Solo</span>
		<nav>
			{#each NAV as item (item.path)}
				<a href={hrefFor(item.path)} class:active={isActive(item.path)}>
					{item.label}
				</a>
			{/each}
		</nav>
	</header>

	{#if route.path === '/diag'}
		<Diagnostics />
	{:else}
		<Home />
	{/if}
</main>

<style>
	main {
		max-width: 880px;
		margin: 2rem auto;
		padding: 0 1.25rem;
		font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto,
			sans-serif;
		color: #1d1f24;
	}

	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
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

	nav {
		margin-left: auto;
		display: flex;
		gap: 0.25rem;
	}

	nav a {
		font-size: 0.875rem;
		color: #4a4d54;
		text-decoration: none;
		padding: 0.25rem 0.625rem;
		border-radius: 0.25rem;
	}

	nav a:hover {
		background: #eef0f4;
	}

	nav a.active {
		background: #1d1f24;
		color: white;
	}
</style>
