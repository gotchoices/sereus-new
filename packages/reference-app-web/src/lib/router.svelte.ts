/**
 * Tiny hash-based router for the reference app.
 *
 * The app is a static SPA — using `window.location.hash` keeps it routable
 * without any server-side configuration. The store re-evaluates whenever the
 * fragment changes and exposes the current path (`/`, `/diag`, `/log`, ...).
 *
 * Routes are flat. We don't need parameter matching or nested layouts yet;
 * `App.svelte` switches on the bare path string.
 */

const DEFAULT_PATH = '/';

function parseHash(hash: string): string {
	if (!hash || hash === '#' || hash === '#/') return DEFAULT_PATH;
	const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
	return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function currentHashPath(): string {
	if (typeof window === 'undefined') return DEFAULT_PATH;
	return parseHash(window.location.hash);
}

const route = $state({ path: currentHashPath() });
let listening = false;

function refresh(): void {
	route.path = currentHashPath();
}

export function routeState(): { path: string } {
	return route;
}

export function startRouter(): void {
	if (listening || typeof window === 'undefined') return;
	listening = true;
	window.addEventListener('hashchange', refresh);
	refresh();
}

export function stopRouter(): void {
	if (!listening || typeof window === 'undefined') return;
	listening = false;
	window.removeEventListener('hashchange', refresh);
}

export function navigate(path: string): void {
	if (typeof window === 'undefined') return;
	const normalized = path.startsWith('/') ? path : `/${path}`;
	window.location.hash = `#${normalized}`;
}

export function hrefFor(path: string): string {
	const normalized = path.startsWith('/') ? path : `/${path}`;
	return `#${normalized}`;
}
