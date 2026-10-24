import type { Lang } from './types.ts';
import { localeFor, WEEKDAYS_I18N } from './i18n.ts';

const cache = new Map<string, Intl.NumberFormat>();

function nf(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = cache.get(key);
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
}

export function formatMoney(value: number, currency: string, compact = false, lang: Lang = 'en'): string {
  if (!isFinite(value)) return '—';
  const digits = Math.abs(value) >= 100000 ? 0 : 2;
  const loc = localeFor(lang);
  const key = `${loc}|${currency}|${digits}|${compact}`;
  try {
    return nf(key, () =>
      new Intl.NumberFormat(loc, {
        style: 'currency',
        currency,
        minimumFractionDigits: compact ? 0 : digits,
        maximumFractionDigits: compact ? 1 : digits,
        notation: compact ? 'compact' : 'standard',
      }),
    ).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}

export function formatNumber(value: number, digits = 2, lang: Lang = 'en'): string {
  const loc = localeFor(lang);
  return nf(`n|${loc}|${digits}`, () =>
    new Intl.NumberFormat(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  ).format(value);
}

/** 0.0123 -> "+1.23%" */
export function formatPct(fraction: number, digits = 2): string {
  if (!isFinite(fraction)) return '—';
  const v = fraction * 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`;
}

export function timeAgo(ms: number, now = Date.now(), lang: Lang = 'en'): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (lang === 'ar') {
    if (s < 10) return 'الآن';
    if (s < 60) return `منذ ${s} ث`;
    const m = Math.round(s / 60);
    if (m < 60) return `منذ ${m} د`;
    const h = Math.round(m / 60);
    if (h < 24) return `منذ ${h} س`;
    return `منذ ${Math.round(h / 24)} ي`;
  }
  if (lang === 'fr') {
    if (s < 10) return "à l'instant";
    if (s < 60) return `il y a ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `il y a ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.round(h / 24)} j`;
  }
  if (lang === 'ur') {
    if (s < 10) return 'ابھی';
    if (s < 60) return `${s} سیکنڈ پہلے`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} منٹ پہلے`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} گھنٹے پہلے`;
    return `${Math.round(h / 24)} دن پہلے`;
  }
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export const WEEKDAYS = WEEKDAYS_I18N.en;

export function formatHour(h: number, lang: Lang = 'en'): string {
  const d = new Date(2000, 0, 1, h);
  return d.toLocaleTimeString(localeFor(lang), { hour: 'numeric' });
}

export function formatDay(sec: number, lang: Lang = 'en'): string {
  return new Date(sec * 1000).toLocaleDateString(localeFor(lang), { weekday: 'short', month: 'short', day: 'numeric' });
}
