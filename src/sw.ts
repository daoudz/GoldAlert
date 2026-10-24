/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { get, set } from 'idb-keyval';
import { fetchSpot } from './lib/data.ts';
import { evaluateAlerts } from './lib/alerts.ts';
import type { AlertState } from './lib/alerts.ts';
import type { Settings } from './lib/types.ts';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();

const ICON = './pwa-192x192.png';

/** Background check (Periodic Background Sync – installed PWA on Chromium/Android). */
async function backgroundCheck() {
  const settings = await get<Settings>('settings');
  if (!settings?.notify?.enabled) return;
  const ctx = await get<{ prevClose: number; rates: Record<string, number> }>('ctx');
  if (!ctx) return;
  const spot = await fetchSpot();
  const prev = (await get<AlertState>('alertState')) ?? {};
  const { messages, state } = evaluateAlerts(
    { price: spot.price, prevClose: ctx.prevClose, rates: ctx.rates, now: Date.now() },
    settings.notify,
    settings,
    prev,
  );
  await set('alertState', state);
  if (!messages.length) return;
  const history = (await get<any[]>('history')) ?? [];
  await set('history', [...messages.map((m) => ({ ...m, time: Date.now() })), ...history].slice(0, 60));
  for (const m of messages) {
    await self.registration.showNotification(m.title, { body: m.body, tag: m.tag, icon: ICON, badge: ICON });
  }
}

self.addEventListener('periodicsync', (event: any) => {
  if (event.tag === 'gold-check') event.waitUntil(backgroundCheck().catch(() => {}));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL('./', self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return (c as WindowClient).focus();
      return self.clients.openWindow(url);
    }),
  );
});
