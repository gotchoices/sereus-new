import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const empty = resolve(here, 'src/shims/empty.ts');

// Browsers already provide crypto.subtle, EventTarget, ReadableStream,
// structuredClone, Promise.withResolvers, AbortSignal.throwIfAborted, and
// TextEncoder/Decoder — the polyfill surface is dramatically smaller than RN.
// Only Node built-ins consumed transitively by libp2p need aliasing.
//
// node:crypto / crypto are deliberately NOT aliased — anything reaching for
// them in a browser bundle is a real bug we want surfaced, not papered over.
export default defineConfig({
	plugins: [svelte()],
	resolve: {
		alias: {
			'node:os': empty,
			'node:net': empty,
			'node:tls': empty,
			'node:stream': 'readable-stream',
			'node:buffer': 'buffer',
			os: empty,
			net: empty,
			tls: empty,
			stream: 'readable-stream',
			buffer: 'buffer',
		},
	},
	define: {
		global: 'globalThis',
	},
	optimizeDeps: {
		include: ['buffer'],
	},
});
