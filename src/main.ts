import { mount } from 'svelte';
import App from './App.svelte';
import { initOffline } from './lib/offline';
import './app.css';

initOffline();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
