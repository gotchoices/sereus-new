/**
 * Polyfill Event, CustomEvent, and EventTarget for Hermes.
 * libp2p (and its dependencies) rely on these Web APIs at import time.
 */

if (typeof globalThis.EventTarget === 'undefined') {
	class EventTarget {
		constructor() {
			this._listeners = new Map();
		}

		addEventListener(type, listener, _options) {
			if (!this._listeners.has(type)) this._listeners.set(type, new Set());
			this._listeners.get(type).add(listener);
		}

		removeEventListener(type, listener, _options) {
			this._listeners.get(type)?.delete(listener);
		}

		dispatchEvent(event) {
			event.target = this;
			const set = this._listeners.get(event.type);
			if (set) for (const fn of set) fn.call(this, event);
			return !event.defaultPrevented;
		}
	}

	globalThis.EventTarget = EventTarget;
}

if (typeof globalThis.Event === 'undefined') {
	class Event {
		constructor(type, options) {
			this.type = type;
			this.bubbles = options?.bubbles ?? false;
			this.cancelable = options?.cancelable ?? false;
			this.composed = options?.composed ?? false;
			this.defaultPrevented = false;
			this.target = null;
			this.currentTarget = null;
			this.timeStamp = Date.now();
		}

		preventDefault() {
			if (this.cancelable) this.defaultPrevented = true;
		}

		stopPropagation() {}
		stopImmediatePropagation() {}
	}

	globalThis.Event = Event;
}

if (typeof globalThis.CustomEvent === 'undefined') {
	class CustomEvent extends globalThis.Event {
		constructor(type, options) {
			super(type, options);
			this.detail = options?.detail ?? null;
		}
	}

	globalThis.CustomEvent = CustomEvent;
}
