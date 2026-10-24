/**
 * Technical analysis + simple forecasting, turned into plain-language advice.
 * Pure functions only (no DOM / npm imports) so the same logic runs in the app,
 * the service worker and the GitHub Actions alert job.
 */
import type { Action, Candle, Lang } from './types.ts';
import { ACTION_I18N } from './i18n.ts';

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

export const ACTION_TEXT: Record<Action, { headline: string; summary: string }> = ACTION_I18N.en;

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
  lang?: Lang;
}

export function analyze({ daily, hourly = [], price, fmt = (x) => `$${x.toFixed(2)}/oz`, lang = 'en' }: AnalyzeInput): Analysis | null {
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
    const days = s200 ? 200 : 100;
    const f50 = fmt(s50);
    const fLong = fmt(longAvg);
    let title: string;
    let detail: string;
    if (lang === 'ar') {
      title = s > 0.25 ? 'الاتجاه طويل الأمد صاعد' : s < -0.25 ? 'الاتجاه طويل الأمد هابط' : 'الاتجاه طويل الأمد مستقر';
      detail =
        s > 0.25
          ? `متوسط 50 يوماً (${f50}) أعلى من متوسط ${days} يوم (${fLong}). الذهب في ارتفاع منذ أشهر، مما يدعم الشراء.`
          : s < -0.25
            ? `متوسط 50 يوماً (${f50}) أقل من متوسط ${days} يوم (${fLong}). الأسعار تتراجع، لذا قد يحصل المشترون على أسعار أفضل بالانتظار.`
            : `متوسط 50 يوماً ومتوسط ${days} يوم متقاربان — لا يوجد اتجاه قوي طويل الأمد.`;
    } else if (lang === 'fr') {
      title = s > 0.25 ? 'La tendance de fond est HAUSSIÈRE' : s < -0.25 ? 'La tendance de fond est BAISSIÈRE' : 'La tendance de fond est stable';
      detail =
        s > 0.25
          ? `La moyenne à 50 jours (${f50}) est au-dessus de la moyenne à ${days} jours (${fLong}). L'or progresse depuis des mois, ce qui favorise l'achat.`
          : s < -0.25
            ? `La moyenne à 50 jours (${f50}) est sous la moyenne à ${days} jours (${fLong}). Les cours glissent, attendre peut offrir un meilleur prix.`
            : `Les moyennes à 50 et ${days} jours sont proches — pas de direction forte à long terme.`;
    } else if (lang === 'ur') {
      title = s > 0.25 ? 'طویل مدتی رجحان اوپر کی طرف ہے' : s < -0.25 ? 'طویل مدتی رجحان نیچے کی طرف ہے' : 'طویل مدتی رجحان مستحکم ہے';
      detail =
        s > 0.25
          ? `50 دن کی اوسط (${f50}) ${days} دن کی اوسط (${fLong}) سے اوپر ہے۔ سونا کئی مہینوں سے بڑھ رہا ہے، جو خریداری کے حق میں ہے۔`
          : s < -0.25
            ? `50 دن کی اوسط (${f50}) ${days} دن کی اوسط (${fLong}) سے نیچے ہے۔ قیمتیں گر رہی ہیں، انتظار کرنے سے بہتر قیمت مل سکتی ہے۔`
            : `50 دن اور ${days} دن کی اوسط قریب ہیں — کوئی مضبوط طویل مدتی سمت نہیں۔`;
    } else {
      const longName = `${days}-day`;
      title = s > 0.25 ? 'Long-term trend is UP' : s < -0.25 ? 'Long-term trend is DOWN' : 'Long-term trend is flat';
      detail =
        s > 0.25
          ? `The 50-day average (${f50}) is above the ${longName} average (${fLong}). Gold has been rising for months, which tends to favour buying.`
          : s < -0.25
            ? `The 50-day average (${f50}) is below the ${longName} average (${fLong}). Prices have been sliding, so buyers may get better prices by waiting.`
            : `The 50-day and ${longName} averages are close together — no strong long-term direction.`;
    }
    factors.push({ id: 'trend', weight: 0.25, score: s, title, detail });
  }

  // 2. Cheap or expensive vs. the normal 20-day range (Bollinger %B)
  {
    const pb = (price - lo) / (up - lo || 1);
    const s = clamp(1 - 2 * pb);
    const dev = price / s20 - 1;
    const pct = Math.abs(dev * 100).toFixed(1);
    const f20 = fmt(s20);
    let title: string;
    let detail: string;
    if (lang === 'ar') {
      title = pb < 0.25 ? 'السعر أرخص من المعتاد' : pb > 0.75 ? 'السعر أغلى من المعتاد' : 'السعر ضمن نطاقه الطبيعي';
      detail =
        pb < 0.25
          ? `سعر اليوم أقل بنسبة ${pct}% من متوسط 20 يوماً، وبالقرب من قاع نطاقه الطبيعي — فرصة شراء نموذجية.`
          : pb > 0.75
            ? `سعر اليوم أعلى بنسبة ${pct}% من متوسط 20 يوماً، وبالقرب من قمة نطاقه الطبيعي. غالباً ما تتراجع الأسعار من هنا.`
            : `سعر اليوم قريب من متوسط 20 يوماً (${f20}).`;
    } else if (lang === 'fr') {
      title = pb < 0.25 ? "Le prix est moins cher que d'habitude" : pb > 0.75 ? "Le prix est plus cher que d'habitude" : 'Le prix est dans sa plage normale';
      detail =
        pb < 0.25
          ? `Le cours du jour est ${pct} % sous sa moyenne à 20 jours, près du bas de sa plage normale — une opportunité d'achat typique.`
          : pb > 0.75
            ? `Le cours du jour est ${pct} % au-dessus de sa moyenne à 20 jours, près du haut de sa plage normale. Les prix corrigent souvent à partir d'ici.`
            : `Le cours du jour est proche de sa moyenne à 20 jours (${f20}).`;
    } else if (lang === 'ur') {
      title = pb < 0.25 ? 'قیمت معمول سے سستی ہے' : pb > 0.75 ? 'قیمت معمول سے مہنگی ہے' : 'قیمت اپنی معمول کی حد میں ہے';
      detail =
        pb < 0.25
          ? `آج کی قیمت اپنی 20 دن کی اوسط سے ${pct}% کم ہے اور معمول کی حد کے نچلے حصے کے قریب ہے — خریداری کا اچھا موقع۔`
          : pb > 0.75
            ? `آج کی قیمت اپنی 20 دن کی اوسط سے ${pct}% زیادہ ہے اور معمول کی حد کے اوپری حصے کے قریب ہے۔ یہاں سے قیمتیں اکثر واپس آتی ہیں۔`
            : `آج کی قیمت اپنی 20 دن کی اوسط (${f20}) کے قریب ہے۔`;
    } else {
      title = pb < 0.25 ? 'Price is cheaper than usual' : pb > 0.75 ? 'Price is more expensive than usual' : 'Price is in its normal range';
      detail =
        pb < 0.25
          ? `Today's price is ${pct}% below its 20-day average, near the bottom of its normal range — a typical buying opportunity.`
          : pb > 0.75
            ? `Today's price is ${pct}% above its 20-day average, near the top of its normal range. Prices often pull back from here.`
            : `Today's price is close to its 20-day average (${f20}).`;
    }
    factors.push({ id: 'range', weight: 0.2, score: s, title, detail });
  }

  // 3. RSI – overbought / oversold
  {
    const s = clamp((50 - r) / 20);
    const rv = r.toFixed(0);
    let title: string;
    let detail: string;
    if (lang === 'ar') {
      title = r < 30 ? 'الذهب في منطقة تشبع بيعي' : r > 70 ? 'الذهب في منطقة تشبع شرائي' : r < 42 ? 'ضغط البيع مرتفع' : r > 58 ? 'ضغط الشراء مرتفع' : 'توازن بين المشترين والبائعين';
      detail =
        r < 30
          ? `كانت عمليات البيع كثيفة مؤخراً (مؤشر القوة ${rv} من 100). غالباً ما ترتد الأسعار صعوداً بعد ذلك.`
          : r > 70
            ? `كانت عمليات الشراء قوية جداً مؤخراً (مؤشر القوة ${rv} من 100). غالباً ما يتبع ذلك تهدئة في السعر.`
            : `مؤشر القوة النسبية (RSI) هو ${rv} من 100. أقل من 30 يعد عادةً منطقة فرصة، وأعلى من 70 يعد مرتفعاً.`;
    } else if (lang === 'fr') {
      title = r < 30 ? "L'or semble survendu" : r > 70 ? "L'or semble suracheté" : r < 42 ? 'La pression vendeuse est forte' : r > 58 ? 'La pression acheteuse est forte' : 'Acheteurs et vendeurs sont équilibrés';
      detail =
        r < 30
          ? `Les ventes ont été intenses récemment (RSI ${rv} sur 100). Les prix rebondissent souvent après cela.`
          : r > 70
            ? `Les achats ont été très forts récemment (RSI ${rv} sur 100). Une accalmie suit souvent.`
            : `L'indice de force (RSI) est à ${rv} sur 100. Sous 30 est généralement une zone d'aubaine, au-dessus de 70 c'est cher.`;
    } else if (lang === 'ur') {
      title = r < 30 ? 'سونا زیادہ فروخت ہو چکا (Oversold)' : r > 70 ? 'سونا زیادہ خریدا جا چکا (Overbought)' : r < 42 ? 'فروخت کا دباؤ زیادہ ہے' : r > 58 ? 'خریداری کا دباؤ زیادہ ہے' : 'خریدار اور فروخت کنندگان متوازن ہیں';
      detail =
        r < 30
          ? `حال ہی میں فروخت کافی تیز رہی ہے (RSI 100 میں سے ${rv})۔ اس کے بعد قیمتیں اکثر واپس اوپر اٹھتی ہیں۔`
          : r > 70
            ? `حال ہی میں خریداری بہت تیز رہی ہے (RSI 100 میں سے ${rv})۔ اس کے بعد اکثر قیمت میں ٹھہراؤ آتا ہے۔`
            : `طاقت کا اشاریہ (RSI) 100 میں سے ${rv} ہے۔ 30 سے نیچے عموماً سستا زون اور 70 سے اوپر مہنگا سمجھا جاتا ہے۔`;
    } else {
      title = r < 30 ? 'Gold looks oversold' : r > 70 ? 'Gold looks overbought' : r < 42 ? 'Selling pressure is high' : r > 58 ? 'Buying pressure is high' : 'Buyers and sellers are balanced';
      detail =
        r < 30
          ? `Selling has been heavy lately (RSI ${rv} of 100). Prices often bounce back after this.`
          : r > 70
            ? `Buying has been very strong lately (RSI ${rv} of 100). A cool-down often follows.`
            : `The strength index (RSI) is ${rv} of 100. Below 30 is usually a bargain zone, above 70 is pricey.`;
    }
    factors.push({ id: 'rsi', weight: 0.2, score: s, title, detail });
  }

  // 4. Momentum – MACD histogram
  {
    const h = m.hist;
    const hNow = last(h) ?? 0;
    const crossedUp = h.slice(-4, -1).some((x) => x != null && x < 0) && hNow > 0;
    const crossedDown = h.slice(-4, -1).some((x) => x != null && x > 0) && hNow < 0;
    const s = clamp(hNow / (a * 0.4 || 1));
    let title: string;
    let detail: string;
    if (lang === 'ar') {
      title = crossedUp ? 'تحول الزخم للتو إلى إيجابي' : crossedDown ? 'تحول الزخم للتو إلى سلبي' : hNow > 0 ? 'الزخم قصير الأمد إيجابي' : 'الزخم قصير الأمد سلبي';
      detail = crossedUp
        ? 'بدأت الأسعار في اكتساب سرعة نحو الصعود — وهي غالباً إشارة مبكرة للارتفاع.'
        : crossedDown
          ? 'بدأت الأسعار في فقدان سرعتها — وهي غالباً إشارة مبكرة للانخفاض.'
          : hNow > 0
            ? 'خلال الأسابيع القليلة الماضية اكتسبت الأسعار زخماً صعودياً.'
            : 'خلال الأسابيع القليلة الماضية فقدت الأسعار بعض زخمها.';
    } else if (lang === 'fr') {
      title = crossedUp ? 'Le momentum vient de passer positif' : crossedDown ? 'Le momentum vient de passer négatif' : hNow > 0 ? 'Le momentum à court terme est positif' : 'Le momentum à court terme est négatif';
      detail = crossedUp
        ? "Les prix commencent à accélérer à la hausse — souvent le signe précurseur d'une montée."
        : crossedDown
          ? "Les prix commencent à s'essouffler — souvent le signe précurseur d'un repli."
          : hNow > 0
            ? 'Au cours des dernières semaines, les prix ont gagné en vitesse à la hausse.'
            : 'Au cours des dernières semaines, les prix ont perdu de leur vitesse.';
    } else if (lang === 'ur') {
      title = crossedUp ? 'رفتار ابھی مثبت ہوئی ہے' : crossedDown ? 'رفتار ابھی منفی ہوئی ہے' : hNow > 0 ? 'مختصر مدتی رفتار مثبت ہے' : 'مختصر مدتی رفتار منفی ہے';
      detail = crossedUp
        ? 'قیمتیں اوپر کی طرف تیزی پکڑ رہی ہیں — جو اکثر اضافے کی ابتدائی علامت ہوتی ہے۔'
        : crossedDown
          ? 'قیمتوں کی رفتار کم ہو رہی ہے — جو اکثر کمی کی ابتدائی علامت ہوتی ہے۔'
          : hNow > 0
            ? 'پچھلے چند ہفتوں کے دوران قیمتوں میں اوپر کی طرف تیزی آئی ہے۔'
            : 'پچھلے چند ہفتوں کے دوران قیمتوں کی رفتار کم ہوئی ہے۔';
    } else {
      title = crossedUp ? 'Momentum just turned positive' : crossedDown ? 'Momentum just turned negative' : hNow > 0 ? 'Short-term momentum is positive' : 'Short-term momentum is negative';
      detail = crossedUp
        ? 'Prices have started to pick up speed upward — often an early sign of a rise.'
        : crossedDown
          ? 'Prices have started to lose speed — often an early sign of a dip.'
          : hNow > 0
            ? 'Over the last few weeks prices have been gaining speed upward.'
            : 'Over the last few weeks prices have been losing speed.';
    }
    factors.push({ id: 'momentum', weight: 0.15, score: s, title, detail });
  }

  // 5. Forecast
  {
    const fs = clamp(forecastChange / (vol * Math.sqrt(7) || 0.01));
    const f = last(forecast);
    const pct = Math.abs(forecastChange * 100).toFixed(1);
    const flat = Math.abs(forecastChange) < 0.002;
    const upFc = forecastChange > 0;
    let title: string;
    let detail: string;
    if (lang === 'ar') {
      title = flat ? 'التوقعات: مستقر تقريباً الأسبوع القادم' : `التوقعات: ${upFc ? 'ارتفاع' : 'انخفاض'} بنحو ${pct}% الأسبوع القادم`;
      detail = f
        ? `بناءً على الاتجاه الأخير، يتوقع نموذجنا حوالي ${fmt(f.value)} خلال 7 أيام (غالباً بين ${fmt(f.lo)} و${fmt(f.hi)}). ${upFc ? 'الشراء مبكراً قد يسبق الارتفاع.' : 'الانتظار قد يمنحك سعراً أفضل.'}`
        : 'لا توجد بيانات كافية للتوقع.';
    } else if (lang === 'fr') {
      title = flat ? 'Prévision : quasi stable la semaine prochaine' : `Prévision : ${upFc ? 'hausse' : 'baisse'} d'environ ${pct} % la semaine prochaine`;
      detail = f
        ? `Selon la tendance récente, notre modèle prévoit environ ${fmt(f.value)} dans 7 jours (probablement entre ${fmt(f.lo)} et ${fmt(f.hi)}). ${upFc ? 'Acheter tôt peut devancer une hausse.' : 'Attendre peut offrir un meilleur prix.'}`
        : 'Pas assez de données pour une prévision.';
    } else if (lang === 'ur') {
      title = flat ? 'پیشگوئی: اگلے ہفتے تقریباً مستحکم' : `پیشگوئی: اگلے ہفتے تقریباً ${pct}% ${upFc ? 'اضافہ' : 'کمی'}`;
      detail = f
        ? `حالیہ رجحان کی بنیاد پر، ہمارا ماڈل 7 دن میں تقریباً ${fmt(f.value)} کی توقع رکھتا ہے (غالباً ${fmt(f.lo)} اور ${fmt(f.hi)} کے درمیان)۔ ${upFc ? 'جلد خریداری اضافے سے پہلے فائدہ دے سکتی ہے۔' : 'انتظار کرنے سے بہتر قیمت مل سکتی ہے۔'}`
        : 'پیشگوئی کے لیے کافی ڈیٹا موجود نہیں۔';
    } else {
      title = flat ? 'Forecast: roughly flat next week' : `Forecast: ${upFc ? 'up' : 'down'} about ${pct}% next week`;
      detail = f
        ? `Based on the recent trend, our model expects around ${fmt(f.value)} in 7 days (likely between ${fmt(f.lo)} and ${fmt(f.hi)}). ${upFc ? 'Buying sooner may beat a rise.' : 'Waiting may give a better price.'}`
        : 'Not enough data for a forecast.';
    }
    factors.push({ id: 'forecast', weight: 0.2, score: fs, title, detail });
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
    .map((f) => (lang === 'en' || lang === 'fr' ? f.title.toLowerCase() : f.title));

  const weekdays = weekdayPattern(daily);
  const cheapestDay = weekdays.reduce((b, x) => (x.n && x.avg < b.avg ? x : b), weekdays[1]).key;
  const hours = hourly.length > 72 ? hourPattern(hourly) : [];
  const cheapestHour = hours.length ? hours.reduce((b, x) => (x.n && x.avg < b.avg ? x : b), hours[0]).key : null;
  const forecastLowIndex = forecast.reduce((bi, x, i, arr) => (x.value < arr[bi].value ? i : bi), 0);

  const actText = ACTION_I18N[lang]?.[action] ?? ACTION_I18N.en[action];
  const reasonsSuffix =
    top.length && action !== 'hold'
      ? lang === 'ar'
        ? ` الأسباب الرئيسية: ${top.join(' و')}.`
        : lang === 'fr'
          ? ` Raisons principales : ${top.join(' et ')}.`
          : lang === 'ur'
            ? ` اہم وجوہات: ${top.join(' اور ')}۔`
            : ` Main reasons: ${top.join(' and ')}.`
      : '';

  const recent = daily.slice(-20);
  return {
    score,
    action,
    headline: actText.headline,
    summary: actText.summary + reasonsSuffix,
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
