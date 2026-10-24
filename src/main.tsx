import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app.tsx';
import { start } from './store.ts';
import { startAlerts } from './notify.ts';
import './styles.css';

render(<App />, document.getElementById('app')!);
start();
startAlerts();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({ immediate: true });
}
