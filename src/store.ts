import { signal, computed, effect } from '@preact/signals';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import type { Candle, Lang, Settings, Spot } from './lib/types.ts';
import { fetchCandles, fetchFx, fetchSpot, scaleCandles } from './lib/data.ts';
import type { Interval } from './lib/data.ts';
import { analyze } from './lib/analysis.ts';
import { convert, FALLBACK_RATES } from './lib/units.ts';
import { formatMoney } from './lib/format.ts';
import { formatUnitLabel, isRtl, tr } from './lib/i18n.ts';
import type { TranslationKey } from './lib/i18n.ts';

// ------------------------------------------------------------------ settings

const SETTINGS_KEY = 'goldalert.settings.v1';
const CACHE_KEY = 'goldalert.cache.v1';

function guessLang(): Lang {
  const langs = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  for (const raw of langs) {
    const l = (raw || '').toLowerCase();
    if (l.startsWith('ar')) return 'ar';
    if (l.startsWith('fr')) return 'fr';
    if (l.startsWith('ur')) return 'ur';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

function guessCurrency(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const map: Record<string, string> = {
    'Asia/Riyadh': 'SAR', 'Asia/Dubai': 'AED', 'Asia/Kuwait': 'KWD', 'Asia/Qatar': 'QAR', 'Asia/Bahrain': 'BHD',
    'Asia/Muscat': 'OMR', 'Asia/Amman': 'JOD', 'Africa/Cairo': 'EGP', 'Asia/Baghdad': 'IQD', 'Europe/Istanbul': 'TRY',
    'Africa/Casablanca': 'MAD', 'Africa/Algiers': 'DZD', 'Africa/Tunis': 'TND', 'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR',
    'Asia/Karachi': 'PKR', 'Europe/London': 'GBP', 'Asia/Tokyo': 'JPY', 'Asia/Shanghai': 'CNY', 'Europe/Zurich': 'CHF',
  };
  if (map[tz]) return map[tz];
  if (tz.startsWith('Europe/')) return 'EUR';
  return 'USD';
}

export const defaultSettings: Settings = {
  lang: guessLang(),
  currency: guessCurrency(),
  unit: 'gram',
  karat: 24,
  theme: 'dark',
  refreshSec: 30,
  notify: { enabled: false, bigMovePct: 1, signals: true, targets: [] },
  ntfyTopic: '',
};

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...defaultSettings, ...s, notify: { ...defaultSettings.notify, ...(s.notify ?? {}) } };
  } catch {
    return defaultSettings;
  }
}

export const settings = signal<Settings>(loadSettings());

effect(() => {
  const s = settings.value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  idbSet('settings', s).catch(() => {});
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.lang = s.lang;
  document.documentElement.dir = isRtl(s.lang) ? 'rtl' : 'ltr';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.theme === 'dark' ? '#0b0e11' : '#f5f5f7');
});

export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch };
}
export function updateNotify(patch: Partial<Settings['notify']>) {
  settings.value = { ...settings.value, notify: { ...settings.value.notify, ...patch } };
}
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  return tr(settings.value.lang, key, vars);
}

// ------------------------------------------------------------------ market data

interface Cached {
  spot: Spot | null;
  daily: Candle[];
  hourly: Candle[];
  rates: Record<string, number>;
  basis: number;
}
function loadCache(): Partial<Cached> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}
const cached = loadCache();

export const spot = signal<Spot | null>(cached.spot ?? null);
export const prevSpot = signal<number | null>(null);
/** raw PAXG candles */
export const dailyRaw = signal<Candle[]>(cached.daily ?? []);
export const hourlyRaw = signal<Candle[]>(cached.hourly ?? []);
/** spot / PAXG ratio captured when candles were loaded */
export const basis = signal<number>(cached.basis ?? 1);
export const rates = signal<Record<string, number>>({ ...FALLBACK_RATES, ...(cached.rates ?? {}) });
export const sources = signal<{ spot?: string; candles?: string; fx?: string }>({});
export const status = signal<{ loading: boolean; error?: string; lastOk?: number }>({ loading: true });

export const rate = computed(() => rates.value[settings.value.currency] ?? 1);
export const daily = computed(() => scaleCandles(dailyRaw.value, basis.value));
export const hourly = computed(() => scaleCandles(hourlyRaw.value, basis.value));

/** Convert USD/oz into the user's display currency/unit/karat */
export function toDisplay(usdOz: number, karat = settings.value.karat, unit = settings.value.unit): number {
  return convert(usdOz, rate.value, unit, karat);
}
export function money(value: number, compact = false): string {
  return formatMoney(value, settings.value.currency, compact, settings.value.lang);
}
export function unitLabel(): string {
  const st = settings.value;
  return formatUnitLabel(st.karat, st.unit, st.currency, st.lang);
}

export const analysis = computed(() => {
  const s = spot.value;
  const d = daily.value;
  if (!s || d.length < 60) return null;
  const st = settings.value;
  const r = rate.value;
  return analyze({
    daily: d,
    hourly: hourly.value,
    price: s.price,
    fmt: (x) => formatMoney(convert(x, r, st.unit, st.karat), st.currency, false, st.lang),
    lang: st.lang,
  });
});

/** Market is closed roughly Fri 21:00 UTC -> Sun 22:00 UTC */
export function marketOpen(now = new Date()): boolean {
  const d = now.getUTCDay();
  const h = now.getUTCHours();
  if (d === 6) return false;
  if (d === 5 && h >= 21) return false;
  if (d === 0 && h < 22) return false;
  return true;
}

function saveCache() {
  const c: Cached = { spot: spot.value, daily: dailyRaw.value, hourly: hourlyRaw.value, rates: rates.value, basis: basis.value };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* quota */
  }
  // context for background checks in the service worker
  const d = daily.value;
  idbSet('ctx', { prevClose: d.length > 1 ? d[d.length - 2].close : 0, rates: rates.value, time: Date.now() }).catch(() => {});
}

function setSpot(s: Spot) {
  if (spot.value) prevSpot.value = spot.value.price;
  spot.value = s;
}

export async function refreshSpot() {
  try {
    const s = await fetchSpot();
    setSpot(s);
    sources.value = { ...sources.value, spot: s.source };
    status.value = { loading: false, lastOk: Date.now() };
  } catch (e) {
    status.value = { ...status.value, loading: false, error: (e as Error).message };
  }
}

export async function refreshCandles() {
  const [d, h, s] = await Promise.allSettled([fetchCandles('1d', 1000), fetchCandles('1h', 1000), fetchSpot()]);
  if (s.status === 'fulfilled') {
    setSpot(s.value);
    sources.value = { ...sources.value, spot: s.value.source };
  }
  if (d.status === 'fulfilled') {
    dailyRaw.value = d.value.candles;
    sources.value = { ...sources.value, candles: d.value.source };
  }
  if (h.status === 'fulfilled') hourlyRaw.value = h.value.candles;
  const ref = h.status === 'fulfilled' ? h.value.candles : d.status === 'fulfilled' ? d.value.candles : null;
  if (ref && spot.value) {
    const k = spot.value.price / ref[ref.length - 1].close;
    basis.value = Math.abs(k - 1) < 0.03 ? k : 1;
  }
  const failed = [d, h, s].filter((x) => x.status === 'rejected') as PromiseRejectedResult[];
  status.value = failed.length === 3
    ? { ...status.value, loading: false, error: String(failed[0].reason?.message ?? failed[0].reason) }
    : { loading: false, lastOk: Date.now() };
  saveCache();
}

export async function refreshFx() {
  try {
    const f = await fetchFx();
    rates.value = { ...FALLBACK_RATES, ...f.rates };
    sources.value = { ...sources.value, fx: f.source };
    saveCache();
  } catch {
    /* keep fallback */
  }
}

// chart ranges (fetched on demand, cached for 2 minutes)
export type Range = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
export const RANGES: Record<Range, { interval: Interval; limit: number; labelKey: TranslationKey }> = {
  '1D': { interval: '15m', limit: 96, labelKey: 'range.1D' },
  '1W': { interval: '1h', limit: 168, labelKey: 'range.1W' },
  '1M': { interval: '4h', limit: 186, labelKey: 'range.1M' },
  '3M': { interval: '1d', limit: 92, labelKey: 'range.3M' },
  '1Y': { interval: '1d', limit: 366, labelKey: 'range.1Y' },
  ALL: { interval: '1d', limit: 1000, labelKey: 'range.ALL' },
};
const rangeCache = new Map<Range, { t: number; candles: Candle[] }>();

export async function loadRange(r: Range): Promise<Candle[]> {
  const c = rangeCache.get(r);
  if (c && Date.now() - c.t < 120_000) return scaleCandles(c.candles, basis.value);
  const { interval, limit } = RANGES[r];
  let candles: Candle[];
  if (interval === '1d' && dailyRaw.value.length > 2) candles = dailyRaw.value.slice(-limit);
  else candles = (await fetchCandles(interval, limit)).candles;
  rangeCache.set(r, { t: Date.now(), candles });
  return scaleCandles(candles, basis.value);
}

// ------------------------------------------------------------------ lifecycle

let spotTimer: ReturnType<typeof setInterval> | undefined;

export function start() {
  refreshFx();
  refreshCandles();
  effect(() => {
    const sec = settings.value.refreshSec;
    clearInterval(spotTimer);
    spotTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshSpot();
    }, sec * 1000);
  });
  setInterval(() => document.visibilityState === 'visible' && refreshCandles(), 10 * 60_000);
  setInterval(refreshFx, 6 * 3600_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - (spot.value?.time ?? 0) > 20_000) refreshCandles();
  });
}

// ------------------------------------------------------------------ install prompt

export const installEvent = signal<any>(null);
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent.value = e;
});

export { idbGet, idbSet };
