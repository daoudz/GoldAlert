/**
 * Technical analysis + simple forecasting, turned into plain-language advice.
 * Pure functions only (no DOM / npm imports) so the same logic runs in the app,
 * the service worker and the GitHub Actions alert job.
 */
import type { Action, Candle } from './types.ts';

type Num = number | null;

// ---------------------------------------------------------------- indicators

export function sma(v: number[], p: number): Num[] {
  const out: Num[] = new Array(v.length).fill(null);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= p) s -= v[i - p];
    if (i >= p - 1) out[i] = s / p;
  }
  return out;
}

export function ema(v: number[], p: number): Num[] {
  const out: Num[] = new Array(v.length).fill(null);
  if (v.length < p) return out;
  const k = 2 / (p + 1);
  let prev = 0;
  for (let i = 0; i < p; i++) prev += v[i];
  prev /= p;
  out[p - 1] = prev;
  for (let i = p; i < v.length; i++) {
    prev = v[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI */
export function rsi(v: number[], p = 14): Num[] {
  const out: Num[] = new Array(v.length).fill(null);
  if (v.length <= p) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= p; i++) {
    const d = v[i] - v[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  g /= p;
  l /= p;
  out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (p - 1) + Math.max(d, 0)) / p;
    l = (l * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export function macd(v: number[], fast = 12, slow = 26, sig = 9) {
  const ef = ema(v, fast);
  const es = ema(v, slow);
  const line: Num[] = v.map((_, i) => (ef[i] != null && es[i] != null ? ef[i]! - es[i]! : null));
  const signal: Num[] = new Array(v.length).fill(null);
  const first = line.findIndex((x) => x != null);
  if (first >= 0) {
    ema(line.slice(first) as number[], sig).forEach((x, j) => (signal[first + j] = x));
  }
  const hist: Num[] = line.map((x, i) => (x != null && signal[i] != null ? x - signal[i]! : null));
  return { line, signal, hist };
}

export function bollinger(v: number[], p = 20, mult = 2) {
  const mid = sma(v, p);
  const upper: Num[] = new Array(v.length).fill(null);
  const lower: Num[] = new Array(v.length).fill(null);
  for (let i = p - 1; i < v.length; i++) {
    const m = mid[i]!;
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += (v[j] - m) ** 2;
    const sd = Math.sqrt(s / p);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

/** Average True Range (last value) */
export function atr(c: Candle[], p = 14): number {
  if (c.length < 2) return 0;
  const tr: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const pc = c[i - 1].close;
    tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - pc), Math.abs(c[i].low - pc)));
  }
  let a = tr.slice(0, p).reduce((s, x) => s + x, 0) / Math.min(p, tr.length);
  for (let i = p; i < tr.length; i++) a = (a * (p - 1) + tr[i]) / p;
  return a;
}

/** Standard deviation of daily log returns over the last n values */
export function volatility(v: number[], n = 60): number {
  const r: number[] = [];
  for (let i = Math.max(1, v.length - n); i < v.length; i++) r.push(Math.log(v[i] / v[i - 1]));
  if (r.length < 2) return 0.01;
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  return Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
}

const last = <T,>(a: T[]): T => a[a.length - 1];
const clamp = (x: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, x));

// ---------------------------------------------------------------- forecast

export interface ForecastPoint {
  time: number;
  value: number;
  lo: number;
  hi: number;
}

/**
 * Holt's linear exponential smoothing with a damped trend, fitted on log prices by grid search.
 * Returns an ~80% prediction band. Deliberately simple and transparent.
 */
export function holtForecast(closes: number[], lastTime: number, horizon = 7, stepSec = 86400): ForecastPoint[] {
  const x = closes.slice(-250).map(Math.log);
  const n = x.length;
  if (n < 10) return [];
  const run = (a: number, b: number, phi: number) => {
    let l = x[0];
    let t = x[1] - x[0];
    let sse = 0;
    let cnt = 0;
    for (let i = 1; i < n; i++) {
      const f = l + phi * t;
      const e = x[i] - f;
      if (i > 5) {
        sse += e * e;
        cnt++;
      }
      const nl = a * x[i] + (1 - a) * (l + phi * t);
      t = b * (nl - l) + (1 - b) * phi * t;
      l = nl;
    }
    return { sse, l, t, sigma: Math.sqrt(sse / Math.max(1, cnt)) };
  };
  let best = { sse: Infinity, a: 0.5, b: 0.1, phi: 0.9 };
  for (let a = 0.1; a <= 0.91; a += 0.1)
    for (const b of [0.01, 0.05, 0.1, 0.2, 0.3])
      for (const phi of [0.8, 0.9, 0.95, 0.98]) {
        const r = run(a, b, phi);
        if (r.sse < best.sse) best = { sse: r.sse, a, b, phi };
      }
  const fit = run(best.a, best.b, best.phi);
  const z = 1.2816; // 80% band
  const out: ForecastPoint[] = [];
  let damp = 0;
  for (let h = 1; h <= horizon; h++) {
    damp += best.phi ** h;
    const mu = fit.l + damp * fit.t;
    const sd = fit.sigma * Math.sqrt(h);
    out.push({ time: lastTime + h * stepSec, value: Math.exp(mu), lo: Math.exp(mu - z * sd), hi: Math.exp(mu + z * sd) });
  }
  return out;
}

// ---------------------------------------------------------------- seasonality ("best time")

export interface PatternBucket {
  key: number;
  /** average deviation from the surrounding average, as a fraction */
  avg: number;
  n: number;
}

function centeredPattern(c: Candle[], half: number, keyOf: (t: number) => number, buckets: number): PatternBucket[] {
  const v = c.map((k) => k.close);
  const sum = new Array(buckets).fill(0);
  const cnt = new Array(buckets).fill(0);
  for (let i = half; i < v.length - half; i++) {
    let s = 0;
    for (let j = i - half; j <= i + half; j++) s += v[j];
    const dev = v[i] / (s / (2 * half + 1)) - 1;
    const k = keyOf(c[i].time);
    sum[k] += dev;
    cnt[k]++;
  }
  return sum.map((s, k) => ({ key: k, avg: cnt[k] ? s / cnt[k] : 0, n: cnt[k] }));
}

/** Which weekday was cheapest relative to its surrounding week (UTC days, last ~year). */
export function weekdayPattern(daily: Candle[]): PatternBucket[] {
  return centeredPattern(daily.slice(-400), 3, (t) => new Date(t * 1000).getUTCDay(), 7);
}

/** Which hour of the day (device local time) was cheapest relative to the surrounding 24h. */
export function hourPattern(hourly: Candle[]): PatternBucket[] {
  return centeredPattern(hourly, 12, (t) => new Date(t * 1000).getHours(), 24);
}

// ---------------------------------------------------------------- advice

export interface Factor {
  id: string;
  title: string;
  detail: string;
  /** -1 (favours selling / waiting) .. +1 (favours buying) */
  score: number;
  weight: number;
}

export interface Analysis {
  score: number;
  action: Action;
  headline: string;
  summary: string;
  confidence: number;
  factors: Factor[];
  forecast: ForecastPoint[];
  forecastChange: number;
  targets: { buyBelow: number; sellAbove: number; support: number; resistance: number };
  stats: {
    price: number;
    prevClose: number;
    change1d: number;
    change7d: number;
    change30d: number;
    change1y: number | null;
    rsi: number;
    sma20: number;
    sma50: number;
    sma200: number | null;
    vol: number;
    high52: number;
    low52: number;
    dayHigh: number;
    dayLow: number;
  };
  best: {
    weekdays: PatternBucket[];
    cheapestDay: number;
    hours: PatternBucket[];
    cheapestHour: number | null;
    forecastLowIndex: number;
  };
}

export const ACTION_TEXT: Record<Action, { headline: string; summary: string }> = {
  'strong-buy': { headline: 'Great time to buy', summary: 'Several signs point to an attractive buying price right now.' },
  buy: { headline: 'Good time to buy', summary: 'Conditions lean in favour of buying.' },
  hold: { headline: 'Wait — no clear signal', summary: "Signals are mixed. If you don't need to buy or sell now, waiting is fine." },
  sell: { headline: 'Consider selling', summary: 'Prices look stretched. Buyers may want to wait; holders could take some profit.' },
  'strong-sell': { headline: 'Good time to sell', summary: 'Prices look high compared to normal — a good moment to take profit.' },
};

export function actionGroup(a: Action): 'buy' | 'hold' | 'sell' {
  return a === 'strong-buy' || a === 'buy' ? 'buy' : a === 'hold' ? 'hold' : 'sell';
}

function actionFor(score: number): Action {
  if (score >= 45) return 'strong-buy';
  if (score >= 15) return 'buy';
  if (score > -15) return 'hold';
  if (score > -45) return 'sell';
  return 'strong-sell';
}

export interface AnalyzeInput {
  daily: Candle[];
  hourly?: Candle[];
  /** live USD/oz price */
  price: number;
  /** formats a USD/oz value for display in explanations */
  fmt?: (usdPerOz: number) => string;
}

export function analyze({ daily, hourly = [], price, fmt = (x) => `$${x.toFixed(2)}/oz` }: AnalyzeInput): Analysis | null {
  if (daily.length < 60) return null;
  const closes = daily.map((c) => c.close);
  const n = closes.length;
  closes[n - 1] = price; // today's candle is still forming -> use live price
  const today = daily[n - 1];
  const prevClose = closes[n - 2];

  const s20 = last(sma(closes, 20))!;
  const s50 = last(sma(closes, 50))!;
  const s200 = n >= 200 ? last(sma(closes, 200)) : null;
  const r = last(rsi(closes))!;
  const m = macd(closes);
  const bb = bollinger(closes);
  const up = last(bb.upper)!;
  const lo = last(bb.lower)!;
  const vol = volatility(closes);
  const a = atr(daily.slice(-60));
  const forecast = holtForecast(closes, today.time);
  const fEnd = forecast.length ? last(forecast).value : price;
  const forecastChange = fEnd / price - 1;
  const year = closes.slice(-365);

  const factors: Factor[] = [];

  // 1. Long-term trend
  {
    const longAvg = s200 ?? last(sma(closes, Math.min(100, n)))!;
    const ratio = s50 / longAvg - 1;
    const s = clamp(ratio * 20);
    const longName = s200 ? '200-day' : '100-day';
    factors.push({
      id: 'trend',
      weight: 0.25,
      score: s,
      title: s > 0.25 ? 'Long-term trend is UP' : s < -0.25 ? 'Long-term trend is DOWN' : 'Long-term trend is flat',
      detail:
        s > 0.25
          ? `The 50-day average (${fmt(s50)}) is above the ${longName} average (${fmt(longAvg)}). Gold has been rising for months, which tends to favour buying.`
          : s < -0.25
            ? `The 50-day average (${fmt(s50)}) is below the ${longName} average (${fmt(longAvg)}). Prices have been sliding, so buyers may get better prices by waiting.`
            : `The 50-day and ${longName} averages are close together — no strong long-term direction.`,
    });
  }

  // 2. Cheap or expensive vs. the normal 20-day range (Bollinger %B)
  {
    const pb = (price - lo) / (up - lo || 1);
    const s = clamp(1 - 2 * pb);
    const dev = price / s20 - 1;
    factors.push({
      id: 'range',
      weight: 0.2,
      score: s,
      title: pb < 0.25 ? 'Price is cheaper than usual' : pb > 0.75 ? 'Price is more expensive than usual' : 'Price is in its normal range',
      detail:
        pb < 0.25
          ? `Today's price is ${Math.abs(dev * 100).toFixed(1)}% below its 20-day average, near the bottom of its normal range — a typical buying opportunity.`
          : pb > 0.75
            ? `Today's price is ${(dev * 100).toFixed(1)}% above its 20-day average, near the top of its normal range. Prices often pull back from here.`
            : `Today's price is close to its 20-day average (${fmt(s20)}).`,
    });
  }

  // 3. RSI – overbought / oversold
  {
    const s = clamp((50 - r) / 20);
    factors.push({
      id: 'rsi',
      weight: 0.2,
      score: s,
      title: r < 30 ? 'Gold looks oversold' : r > 70 ? 'Gold looks overbought' : r < 42 ? 'Selling pressure is high' : r > 58 ? 'Buying pressure is high' : 'Buyers and sellers are balanced',
      detail:
        r < 30
          ? `Selling has been heavy lately (RSI ${r.toFixed(0)} of 100). Prices often bounce back after this.`
          : r > 70
            ? `Buying has been very strong lately (RSI ${r.toFixed(0)} of 100). A cool-down often follows.`
            : `The strength index (RSI) is ${r.toFixed(0)} of 100. Below 30 is usually a bargain zone, above 70 is pricey.`,
    });
  }

  // 4. Momentum – MACD histogram
  {
    const h = m.hist;
    const hNow = last(h) ?? 0;
    const crossedUp = h.slice(-4, -1).some((x) => x != null && x < 0) && hNow > 0;
    const crossedDown = h.slice(-4, -1).some((x) => x != null && x > 0) && hNow < 0;
    const s = clamp(hNow / (a * 0.4 || 1));
    factors.push({
      id: 'momentum',
      weight: 0.15,
      score: s,
      title: crossedUp ? 'Momentum just turned positive' : crossedDown ? 'Momentum just turned negative' : hNow > 0 ? 'Short-term momentum is positive' : 'Short-term momentum is negative',
      detail: crossedUp
        ? 'Prices have started to pick up speed upward — often an early sign of a rise.'
        : crossedDown
          ? 'Prices have started to lose speed — often an early sign of a dip.'
          : hNow > 0
            ? 'Over the last few weeks prices have been gaining speed upward.'
            : 'Over the last few weeks prices have been losing speed.',
    });
  }

  // 5. Forecast
  {
    const fs = clamp(forecastChange / (vol * Math.sqrt(7) || 0.01));
    const f = last(forecast);
    factors.push({
      id: 'forecast',
      weight: 0.2,
      score: fs,
      title:
        Math.abs(forecastChange) < 0.002
          ? 'Forecast: roughly flat next week'
          : `Forecast: ${forecastChange > 0 ? 'up' : 'down'} about ${Math.abs(forecastChange * 100).toFixed(1)}% next week`,
      detail: f
        ? `Based on the recent trend, our model expects around ${fmt(f.value)} in 7 days (likely between ${fmt(f.lo)} and ${fmt(f.hi)}). ${forecastChange > 0 ? 'Buying sooner may beat a rise.' : 'Waiting may give a better price.'}`
        : 'Not enough data for a forecast.',
    });
  }

  const wsum = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round((factors.reduce((s, f) => s + f.weight * f.score, 0) / wsum) * 100);
  const action = actionFor(score);
  const sign = Math.sign(score) || 1;
  const agree = factors.filter((f) => Math.sign(f.score) === sign).reduce((s, f) => s + f.weight, 0) / wsum;
  const confidence = Math.round(clamp(25 + 45 * agree + 0.6 * Math.abs(score), 0, 95));

  const top = [...factors]
    .filter((f) => Math.sign(f.score) === sign && Math.abs(f.score) > 0.2)
    .sort((x, y) => Math.abs(y.score * y.weight) - Math.abs(x.score * x.weight))
    .slice(0, 2)
    .map((f) => f.title.toLowerCase());

  const weekdays = weekdayPattern(daily);
  const cheapestDay = weekdays.reduce((b, x) => (x.n && x.avg < b.avg ? x : b), weekdays[1]).key;
  const hours = hourly.length > 72 ? hourPattern(hourly) : [];
  const cheapestHour = hours.length ? hours.reduce((b, x) => (x.n && x.avg < b.avg ? x : b), hours[0]).key : null;
  const forecastLowIndex = forecast.reduce((bi, x, i, arr) => (x.value < arr[bi].value ? i : bi), 0);

  const recent = daily.slice(-20);
  return {
    score,
    action,
    headline: ACTION_TEXT[action].headline,
    summary: ACTION_TEXT[action].summary + (top.length && action !== 'hold' ? ` Main reasons: ${top.join(' and ')}.` : ''),
    confidence,
    factors,
    forecast,
    forecastChange,
    targets: {
      buyBelow: (lo + s20) / 2,
      sellAbove: (up + s20) / 2,
      support: Math.min(...recent.map((c) => c.low)),
      resistance: Math.max(...recent.map((c) => c.high)),
    },
    stats: {
      price,
      prevClose,
      change1d: price / prevClose - 1,
      change7d: price / closes[Math.max(0, n - 8)] - 1,
      change30d: price / closes[Math.max(0, n - 31)] - 1,
      change1y: n > 365 ? price / closes[n - 366] - 1 : null,
      rsi: r,
      sma20: s20,
      sma50: s50,
      sma200: s200,
      vol,
      high52: Math.max(...year, price),
      low52: Math.min(...year, price),
      dayHigh: Math.max(today.high, price),
      dayLow: Math.min(today.low, price),
    },
    best: { weekdays, cheapestDay, hours, cheapestHour, forecastLowIndex },
  };
}
