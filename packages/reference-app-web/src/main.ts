// Polyfills MUST run before any Optimystic / libp2p module is evaluated.
import './polyfills.js';

import { mount } from 'svelte';
import App from './App.svelte';
import './main.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount target');

const app = mount(App, { target });

export default app;
