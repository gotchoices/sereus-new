// Hermes runtime polyfills for APIs that libp2p and its dependencies expect.
// Must be imported before any library code.
//
// React Native 0.76+ with New Architecture should provide crypto.getRandomValues
// natively. These polyfills are fallbacks for environments where it is still missing.

// Native CSPRNG — must be the very first import so globalThis.crypto.getRandomValues
// is available before any library code. No-op if the native API already exists.
// NOTE: requires native rebuild (EAS Build or local native build).
require('react-native-get-random-values');

// ── crypto.getRandomValues ──────────────────────────────────────────────────
// Required by: @noble/hashes (via @libp2p/crypto, @noble/curves)

if (typeof globalThis.crypto === 'undefined') {
	globalThis.crypto = /** @type {any} */ ({});
}

// ── crypto.subtle.digest ──────────────────────────────────────────────────
// Required by: multiformats/hashes/sha2-browser (used when Metro picks the
// browser variant via the package.json "browser" field).

if (!globalThis.crypto.subtle) {
	const _hashCache = {};
	function getHash(name) {
		if (_hashCache[name]) return _hashCache[name];
		const mod = require('@noble/hashes/sha2');
		_hashCache['SHA-256'] = mod.sha256;
		_hashCache['SHA-512'] = mod.sha512;
		return _hashCache[name];
	}
	globalThis.crypto.subtle = {
		digest(algorithm, data) {
			const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
			const fn = getHash(name);
			if (!fn) return Promise.reject(new Error('Unsupported digest algorithm: ' + name));
			return Promise.resolve(fn(new Uint8Array(data)).buffer);
		},
	};
}

if (typeof globalThis.crypto.getRandomValues !== 'function') {
	globalThis.crypto.getRandomValues = function getRandomValues(array) {
		for (let i = 0; i < array.length; i++) {
			array[i] = Math.floor(Math.random() * 256);
		}
		return array;
	};
	console.error(
		'[hermes polyfill] INSECURE — Using Math.random() fallback for crypto.getRandomValues. '
		+ 'This is only acceptable for development without a native build. '
		+ 'Run an EAS Build or local native build to get a real CSPRNG.',
	);
}

// ── TextDecoder (UTF-8 only) ───────────────────────────────────────────────
// Expo SDK 52+ Hermes provides TextDecoder natively — this block is a no-op
// there.  Bare RN 0.85 Hermes ships TextEncoder but NOT TextDecoder; the
// `uint8arrays` package (pulled in by libp2p / multiformats / yamux) does
// `const decoder = new TextDecoder('utf8')` at module scope, so without this
// polyfill yamux's default export resolves to `undefined` and CadreNode.start
// fails with "Cannot read property 'Yamux' of undefined".
//
// Kept UTF-8-only to avoid pulling in a full text-encoding polyfill; throws a
// clear RangeError if anything asks for another encoding.
if (typeof globalThis.TextDecoder === 'undefined') {
	class TextDecoderPolyfill {
		constructor(label = 'utf-8') {
			const enc = String(label).toLowerCase().replace('_', '-');
			if (enc !== 'utf-8' && enc !== 'utf8') {
				throw new RangeError(`TextDecoder polyfill only supports UTF-8 (got "${label}")`);
			}
			this.encoding = 'utf-8';
			this.fatal = false;
			this.ignoreBOM = false;
		}
		decode(input) {
			if (input == null) return '';
			const bytes = input instanceof Uint8Array
				? input
				: ArrayBuffer.isView(input)
					? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
					: new Uint8Array(input);
			if (bytes.length === 0) return '';
			let i = 0;
			let str = '';
			if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) i = 3;
			while (i < bytes.length) {
				const b = bytes[i++];
				if (b < 0x80) {
					str += String.fromCharCode(b);
				} else if (b < 0xC0) {
					str += '\uFFFD';
				} else if (b < 0xE0) {
					str += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i++] & 0x3F));
				} else if (b < 0xF0) {
					str += String.fromCharCode(
						((b & 0x0F) << 12) | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F),
					);
				} else {
					let cp = ((b & 0x07) << 18)
						| ((bytes[i++] & 0x3F) << 12)
						| ((bytes[i++] & 0x3F) << 6)
						| (bytes[i++] & 0x3F);
					cp -= 0x10000;
					str += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
				}
			}
			return str;
		}
	}
	globalThis.TextDecoder = TextDecoderPolyfill;
}

// ── structuredClone ─────────────────────────────────────────────────────────
// Not yet supported by Hermes.
// Required by: @optimystic/db-core (transform tracker, cache-source, coordinator)

if (typeof globalThis.structuredClone !== 'function') {
	const _structuredClone = require('@ungap/structured-clone').default;
	globalThis.structuredClone = function structuredClone(value) {
		return _structuredClone(value);
	};
}

// ── Symbol.asyncIterator ───────────────────────────────────────────────────
// Some Hermes versions omit this, breaking `for await...of` on custom iterables.

if (typeof Symbol.asyncIterator === 'undefined') {
	Symbol.asyncIterator = Symbol('Symbol.asyncIterator');
}

// ── Web Streams API ────────────────────────────────────────────────────────
// Required by: Vercel AI SDK, streaming-oriented libraries
// Not yet supported by Hermes.

if (typeof globalThis.ReadableStream === 'undefined') {
	const webStreams = require('web-streams-polyfill');
	globalThis.ReadableStream = webStreams.ReadableStream;
	globalThis.WritableStream = webStreams.WritableStream;
	globalThis.TransformStream = webStreams.TransformStream;
}

// ── Promise.withResolvers ───────────────────────────────────────────────────
// ES2024 — not yet supported by Hermes.
// Required by: @libp2p/utils, @libp2p/ping, @chainsafe/libp2p-yamux,
//              it-queue, mortice, abort-error

if (typeof Promise.withResolvers !== 'function') {
	Promise.withResolvers = function withResolvers() {
		let resolve, reject;
		const promise = new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return { promise, resolve, reject };
	};
}

// ── AbortSignal.prototype.throwIfAborted ────────────────────────────────────
// DOM spec addition — not yet in Hermes.
// Required by: libp2p, @libp2p/utils, @libp2p/circuit-relay-v2,
//              @chainsafe/libp2p-yamux, it-pushable, p-retry, p-event, etc.

if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.prototype.throwIfAborted !== 'function') {
	AbortSignal.prototype.throwIfAborted = function throwIfAborted() {
		if (this.aborted) {
			throw this.reason ?? new DOMException('The operation was aborted.', 'AbortError');
		}
	};
}

// ── Timer .ref() / .unref() ────────────────────────────────────────────────
// Node.js timers return objects with .ref()/.unref(); Hermes returns numbers.
// Required by: @optimystic/db-p2p (cluster-repo), undici, libp2p internals
//
// We also patch clearTimeout/clearInterval to unwrap, since RN's native
// clear functions expect the raw numeric ID (the `promise` package's
// rejection-tracking stores timer handles and passes them to clearTimeout).

const _origSetTimeout = globalThis.setTimeout;
const _origSetInterval = globalThis.setInterval;
const _origClearTimeout = globalThis.clearTimeout;
const _origClearInterval = globalThis.clearInterval;

function unwrapTimer(handle) {
	return (handle && typeof handle === 'object' && '_id' in handle)
		? handle._id
		: handle;
}

function wrapTimer(id) {
	if (typeof id === 'object' && id !== null) return id;
	return {
		_id: id,
		ref() { return this; },
		unref() { return this; },
		[Symbol.toPrimitive]() { return this._id; },
	};
}

globalThis.setTimeout = function patchedSetTimeout(...args) {
	return wrapTimer(_origSetTimeout.apply(this, args));
};
Object.assign(globalThis.setTimeout, _origSetTimeout);

globalThis.setInterval = function patchedSetInterval(...args) {
	return wrapTimer(_origSetInterval.apply(this, args));
};
Object.assign(globalThis.setInterval, _origSetInterval);

globalThis.clearTimeout = function patchedClearTimeout(handle) {
	return _origClearTimeout.call(this, unwrapTimer(handle));
};

globalThis.clearInterval = function patchedClearInterval(handle) {
	return _origClearInterval.call(this, unwrapTimer(handle));
};
