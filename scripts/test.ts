import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert, toUsdOz, OZ_GRAMS } from '../src/lib/units.ts';
import { sma, ema, rsi, bollinger, holtForecast, analyze, actionGroup } from '../src/lib/analysis.ts';
import { evaluateAlerts } from '../src/lib/alerts.ts';
import type { Candle, DisplayPrefs, NotifySettings } from '../src/lib/types.ts';

test('unit & karat conversions round-trip accurately', () => {
  const usdOz = 4000;
  // 24K ounce in USD should equal usdOz
  assert.ok(Math.abs(convert(usdOz, 1, 'ounce', 24) - usdOz) < 1e-9);
  // 24K gram in USD = usdOz / 31.1034768
  const g24 = convert(usdOz, 1, 'gram', 24);
  assert.ok(Math.abs(g24 - usdOz / OZ_GRAMS) < 1e-9);
  // 18K is 75% of 24K
  const g18 = convert(usdOz, 1, 'gram', 18);
  assert.ok(Math.abs(g18 / g24 - 0.75) < 1e-9);
  // Round-trip with SAR (3.75) and 21K tola
  const sarTola21 = convert(usdOz, 3.75, 'tola', 21);
  assert.ok(Math.abs(toUsdOz(sarTola21, 3.75, 'tola', 21) - usdOz) < 1e-6);
});

test('technical indicators & Holt forecast produce valid ranges', () => {
  const vals = Array.from({ length: 100 }, (_, i) => 3000 + i * 5 + Math.sin(i / 2) * 15);
  const s20 = sma(vals, 20);
  assert.equal(s20[18], null);
  assert.ok(s20[19]! > 3000);

  const e20 = ema(vals, 20);
  assert.ok(e20[99]! > e20[20]!);

  const r = rsi(vals, 14);
  const lastR = r[r.length - 1]!;
  assert.ok(lastR >= 0 && lastR <= 100);

  const bb = bollinger(vals, 20, 2);
  assert.ok(bb.upper[99]! > bb.mid[99]! && bb.mid[99]! > bb.lower[99]!);

  const fc = holtForecast(vals, 1_700_000_000, 7);
  assert.equal(fc.length, 7);
  for (const p of fc) {
    assert.ok(p.lo < p.value && p.value < p.hi);
  }
});

test('analyze() detects buy on dip in uptrend and sell on overbought spike', () => {
  const t0 = 1_700_000_000;
  // 220 days of steady uptrend, followed by a sharp 5-day pullback (oversold dip in uptrend)
  const dipCandles: Candle[] = Array.from({ length: 220 }, (_, i) => {
    const base = 3000 + i * 4 - (i > 214 ? (i - 214) * 32 : 0);
    return { time: t0 + i * 86400, open: base + 5, high: base + 12, low: base - 10, close: base };
  });
  const dipRes = analyze({ daily: dipCandles, price: dipCandles[dipCandles.length - 1].close });
  assert.ok(dipRes);
  assert.equal(actionGroup(dipRes.action), 'buy', `Expected buy on uptrend dip, got ${dipRes.action} (${dipRes.score})`);
  assert.ok(dipRes.targets.buyBelow < dipRes.targets.sellAbove);

  // Downtrend with sudden overbought spike
  const spikeCandles: Candle[] = Array.from({ length: 220 }, (_, i) => {
    const base = 4200 - i * 4 + (i > 212 ? (i - 212) * 38 : 0);
    return { time: t0 + i * 86400, open: base - 5, high: base + 12, low: base - 8, close: base };
  });
  const spikeRes = analyze({ daily: spikeCandles, price: spikeCandles[spikeCandles.length - 1].close });
  assert.ok(spikeRes);
  assert.equal(actionGroup(spikeRes.action), 'sell', `Expected sell on downtrend spike, got ${spikeRes.action} (${spikeRes.score})`);
});

test('evaluateAlerts fires once per threshold and re-arms cleanly', () => {
  const display: DisplayPrefs = { currency: 'USD', unit: 'ounce', karat: 24 };
  const notify: NotifySettings = {
    enabled: true,
    bigMovePct: 1,
    signals: true,
    targets: [{ id: 't1', direction: 'below', price: 3950, currency: 'USD', unit: 'ounce', karat: 24, createdAt: 1 }],
  };
  const now = Date.UTC(2026, 9, 24, 10, 0, 0);

  // 1.5% drop from 4000 -> 3940 triggers both big-move and target-below-3950
  const r1 = evaluateAlerts(
    { price: 3940, prevClose: 4000, rates: { USD: 1 }, now, action: 'hold' },
    notify,
    display,
    { lastAction: 'hold' },
  );
  assert.equal(r1.messages.length, 2);
  assert.ok(r1.messages.some((m) => m.kind === 'move'));
  assert.ok(r1.messages.some((m) => m.kind === 'target'));

  // Calling again at the same price does NOT duplicate alerts
  const r2 = evaluateAlerts(
    { price: 3940, prevClose: 4000, rates: { USD: 1 }, now: now + 60_000, action: 'hold' },
    notify,
    display,
    r1.state,
  );
  assert.equal(r2.messages.length, 0);

  // Switching from hold -> buy triggers a signal alert
  const r3 = evaluateAlerts(
    { price: 3940, prevClose: 4000, rates: { USD: 1 }, now: now + 120_000, action: 'buy' },
    notify,
    display,
    r2.state,
  );
  assert.equal(r3.messages.length, 1);
  assert.equal(r3.messages[0].kind, 'signal');
});
