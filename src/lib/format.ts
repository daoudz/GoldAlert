const cache = new Map<string, Intl.NumberFormat>();

function nf(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = cache.get(key);
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
}

export function formatMoney(value: number, currency: string, compact = false): string {
  if (!isFinite(value)) return '—';
  const digits = Math.abs(value) >= 100000 ? 0 : 2;
  const key = `${currency}|${digits}|${compact}`;
  try {
    return nf(key, () =>
      new Intl.NumberFormat('en-US', {
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

export function formatNumber(value: number, digits = 2): string {
  return nf(`n|${digits}`, () =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  ).format(value);
}

/** 0.0123 -> "+1.23%" */
export function formatPct(fraction: number, digits = 2): string {
  if (!isFinite(fraction)) return '—';
  const v = fraction * 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`;
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatHour(h: number): string {
  const d = new Date(2000, 0, 1, h);
  return d.toLocaleTimeString([], { hour: 'numeric' });
}

export function formatDay(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
