import { signal, effect } from '@preact/signals';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { evaluateAlerts } from './lib/alerts.ts';
import type { AlertMessage, AlertState } from './lib/alerts.ts';
import { analysis, daily, rates, settings, spot } from './store.ts';

export interface HistoryItem extends AlertMessage {
  time: number;
}

export const permission = signal<NotificationPermission | 'unsupported'>(
  'Notification' in window ? Notification.permission : 'unsupported',
);
export const history = signal<HistoryItem[]>([]);
export const alertState = signal<AlertState>({});
export const toasts = signal<(HistoryItem & { id: number })[]>([]);

const ICON = './pwa-192x192.png';

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  const p = await Notification.requestPermission();
  permission.value = p;
  if (p === 'granted') registerPeriodicSync();
  return p === 'granted';
}

export async function showNotification(title: string, body: string, tag = 'goldalert') {
  if (permission.value !== 'granted') return;
  const opts: NotificationOptions = { body, tag, icon: ICON, badge: ICON, data: { url: location.href.split('#')[0] } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(title, opts);
  } catch {
    /* fall through */
  }
  try {
    new Notification(title, opts);
  } catch {
    /* some mobile browsers only allow SW notifications */
  }
}

function pushToast(item: HistoryItem) {
  const id = Math.random();
  toasts.value = [...toasts.value, { ...item, id }];
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), 7000);
}

async function addHistory(items: HistoryItem[]) {
  const h = [...items, ...((await idbGet<HistoryItem[]>('history')) ?? [])].slice(0, 60);
  history.value = h;
  await idbSet('history', h);
}

export async function clearHistory() {
  history.value = [];
  await idbSet('history', []);
}

export async function rearmTarget(id: string) {
  const s = { ...alertState.value, firedTargets: (alertState.value.firedTargets ?? []).filter((x) => x !== id) };
  alertState.value = s;
  await idbSet('alertState', s);
}

export async function testNotification() {
  const s = spot.value;
  await showNotification('🔔 GoldAlert test', s ? 'Notifications are working! You will be alerted about big moves and buy/sell chances.' : 'Notifications are working!', 'test');
}

async function registerPeriodicSync() {
  try {
    const reg: any = await navigator.serviceWorker?.ready;
    if (!reg?.periodicSync) return;
    const st = await (navigator.permissions as any).query({ name: 'periodic-background-sync' });
    if (st.state === 'granted') await reg.periodicSync.register('gold-check', { minInterval: 60 * 60 * 1000 });
  } catch {
    /* unsupported */
  }
}

/** Send a push message through ntfy.sh (used for the "send test push" button). */
export async function sendNtfy(topic: string, title: string, message: string): Promise<boolean> {
  try {
    // JSON publishing goes to the server root with the topic inside the body
    const res = await fetch('https://ntfy.sh/', {
      method: 'POST',
      body: JSON.stringify({ topic, title, message, tags: ['coin'], click: location.href.split('#')[0] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let checking = false;

/** Watches live prices + advice and fires alerts. */
export async function startAlerts() {
  alertState.value = (await idbGet<AlertState>('alertState')) ?? {};
  history.value = (await idbGet<HistoryItem[]>('history')) ?? [];
  if (permission.value === 'granted') registerPeriodicSync();

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      alertState.value = (await idbGet<AlertState>('alertState')) ?? alertState.value;
      history.value = (await idbGet<HistoryItem[]>('history')) ?? history.value;
      if ('Notification' in window) permission.value = Notification.permission;
    }
  });

  effect(() => {
    const s = spot.value;
    const a = analysis.value;
    const d = daily.value;
    const st = settings.value;
    const r = rates.value;
    if (!s || d.length < 2 || checking) return;
    checking = true;
    queueMicrotask(async () => {
      try {
        const res = evaluateAlerts(
          { price: s.price, prevClose: d[d.length - 2].close, rates: r, now: Date.now(), action: a?.action, summary: a?.summary },
          st.notify,
          st,
          alertState.value,
        );
        alertState.value = res.state;
        await idbSet('alertState', res.state);
        if (res.messages.length) {
          const items = res.messages.map((m) => ({ ...m, time: Date.now() }));
          await addHistory(items);
          for (const m of items) {
            if (document.visibilityState === 'visible') pushToast(m);
            if (st.notify.enabled) await showNotification(m.title, m.body, m.tag);
          }
        }
      } finally {
        checking = false;
      }
    });
  });
}
