/**
 * Market data access with automatic fallbacks. Works in browsers, service workers and Node 18+.
 *
 * - Live spot price: gold-api.com (XAU spot), falling back to PAX Gold (PAXG, a token backed
 *   1:1 by a troy ounce of London Good Delivery gold) on Binance / Coinbase / Kraken.
 * - History (candles): PAXG on Binance / Coinbase / Kraken – free, keyless and CORS-enabled.
 * - FX rates: open.er-api.com, falling back to frankfurter.app.
 */
import type { Candle, Spot } from './types.ts';

const TIMEOUT_MS = 9000;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function firstOk<T>(attempts: [string, () => Promise<T>][]): Promise<{ value: T; source: string }> {
  const errors: string[] = [];
  for (const [source, fn] of attempts) {
    try {
      return { value: await fn(), source };
    } catch (e) {
      errors.push(`${source}: ${(e as Error).message}`);
    }
  }
  throw new Error(`All data sources failed (${errors.join('; ')})`);
}

function num(x: unknown): number {
  const n = Number(x);
  if (!isFinite(n) || n <= 0) throw new Error('invalid number');
  return n;
}

export async function fetchSpot(): Promise<Spot> {
  const { value, source } = await firstOk<number>([
    ['gold-api.com', async () => num((await getJson('https://api.gold-api.com/price/XAU')).price)],
    ['Binance (PAXG)', async () => num((await getJson('https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT')).price)],
    ['Coinbase (PAXG)', async () => num((await getJson('https://api.exchange.coinbase.com/products/PAXG-USD/ticker')).price)],
    ['Kraken (PAXG)', async () => {
      const j = await getJson('https://api.kraken.com/0/public/Ticker?pair=PAXGUSD');
      const key = Object.keys(j.result ?? {})[0];
      return num(j.result[key].c[0]);
    }],
  ]);
  return { price: value, time: Date.now(), source };
}

export type Interval = '15m' | '1h' | '4h' | '1d';
export const INTERVAL_SEC: Record<Interval, number> = { '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };

function validCandles(c: Candle[]): Candle[] {
  const out = c.filter((k) => isFinite(k.close) && k.close > 0).sort((a, b) => a.time - b.time);
  if (out.length < 2) throw new Error('no candles');
  return out;
}

export async function fetchCandles(interval: Interval, limit: number): Promise<{ candles: Candle[]; source: string }> {
  const { value, source } = await firstOk<Candle[]>([
    ['Binance (PAXG)', async () => {
      const j: any[] = await getJson(
        `https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=${interval}&limit=${Math.min(limit, 1000)}`,
      );
      return validCandles(j.map((k) => ({ time: k[0] / 1000, open: +k[1], high: +k[2], low: +k[3], close: +k[4] })));
    }],
    ['Coinbase (PAXG)', async () => {
      // Coinbase has no 4h granularity -> use 6h. Max 300 candles per request.
      const g = interval === '4h' ? 21600 : INTERVAL_SEC[interval];
      const j: number[][] = await getJson(`https://api.exchange.coinbase.com/products/PAXG-USD/candles?granularity=${g}`);
      return validCandles(j.map((k) => ({ time: k[0], low: k[1], high: k[2], open: k[3], close: k[4] }))).slice(-limit);
    }],
    ['Kraken (PAXG)', async () => {
      const j = await getJson(`https://api.kraken.com/0/public/OHLC?pair=PAXGUSD&interval=${INTERVAL_SEC[interval] / 60}`);
      if (j.error?.length) throw new Error(j.error.join(','));
      const key = Object.keys(j.result).find((k) => k !== 'last')!;
      return validCandles(
        (j.result[key] as any[]).map((k) => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4] })),
      ).slice(-limit);
    }],
  ]);
  return { candles: value, source };
}

export async function fetchFx(): Promise<{ rates: Record<string, number>; source: string }> {
  const { value, source } = await firstOk<Record<string, number>>([
    ['open.er-api.com', async () => {
      const j = await getJson('https://open.er-api.com/v6/latest/USD');
      if (j.result !== 'success') throw new Error('bad response');
      return j.rates;
    }],
    ['frankfurter.app', async () => {
      const j = await getJson('https://api.frankfurter.app/latest?from=USD');
      return { USD: 1, ...j.rates };
    }],
  ]);
  return { rates: value, source };
}

/** Rescale PAXG candles so they line up with the XAU spot price (removes the small token premium). */
export function scaleCandles(c: Candle[], k: number): Candle[] {
  if (k === 1) return c;
  return c.map((x) => ({ time: x.time, open: x.open * k, high: x.high * k, low: x.low * k, close: x.close * k }));
}
