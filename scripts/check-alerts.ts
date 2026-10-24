/**
 * Phone push alerts via ntfy.sh — runs on a schedule in GitHub Actions (see .github/workflows/alerts.yml).
 * Node 22.18+/24 runs this TypeScript file directly (type stripping); no npm install needed.
 *
 * Env:
 *   NTFY_TOPIC (required)       ntfy topic to publish to
 *   NTFY_SERVER                 default https://ntfy.sh
 *   ALERT_CURRENCY / ALERT_UNIT / ALERT_KARAT   display prefs, default USD / ounce / 24
 *   BIG_MOVE_PCT                default 1.5
 *   SIGNALS                     "false" disables buy/sell change alerts
 *   ALERT_BELOW / ALERT_ABOVE   optional price targets in the display prefs above
 *   DAILY_SUMMARY_HOUR_UTC      hour (0-23) to send a daily summary; "" to disable. default 6
 *   APP_URL                     link opened when tapping the notification
 *   STATE_FILE                  default .alert-state/state.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchCandles, fetchFx, fetchSpot, scaleCandles } from '../src/lib/data.ts';
import { analyze } from '../src/lib/analysis.ts';
import { evaluateAlerts, priceIn, describePrefs } from '../src/lib/alerts.ts';
import type { AlertMessage, AlertState } from '../src/lib/alerts.ts';
import type { DisplayPrefs, Karat, Lang, PriceTarget, Unit } from '../src/lib/types.ts';
import { convert, FALLBACK_RATES } from '../src/lib/units.ts';
import { formatMoney, formatPct } from '../src/lib/format.ts';

const env = process.env;
const topic = env.NTFY_TOPIC?.trim();
const server = (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
const stateFile = env.STATE_FILE || '.alert-state/state.json';
const dry = process.argv.includes('--dry-run');

const lang = ((env.ALERT_LANG || 'en').toLowerCase() as Lang);
const display: DisplayPrefs = {
  lang,
  currency: (env.ALERT_CURRENCY || 'USD').toUpperCase(),
  unit: ((env.ALERT_UNIT || 'ounce').toLowerCase() as Unit),
  karat: (Number(env.ALERT_KARAT || 24) as Karat),
};

function readState(): AlertState {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

async function publish(m: AlertMessage) {
  console.log(`→ [${m.kind}] ${m.title} — ${m.body}`);
  if (dry || !topic) return;
  const res = await fetch(`${server}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic,
      title: m.title,
      message: m.body,
      priority: m.priority,
      tags: ['coin'],
      ...(env.APP_URL ? { click: env.APP_URL } : {}),
    }),
  });
  if (!res.ok) console.error(`ntfy error ${res.status}: ${await res.text()}`);
}

async function main() {
  if (!topic && !dry) {
    console.log('NTFY_TOPIC secret is not set — skipping. Add it in Settings → Secrets and variables → Actions.');
    return;
  }
  const [spot, d, h, fx] = await Promise.all([
    fetchSpot(),
    fetchCandles('1d', 500),
    fetchCandles('1h', 500).catch(() => null),
    fetchFx().catch(() => ({ rates: FALLBACK_RATES, source: 'fallback' })),
  ]);
  const ref = h?.candles ?? d.candles;
  let k = spot.price / ref[ref.length - 1].close;
  if (Math.abs(k - 1) > 0.03) k = 1;
  const daily = scaleCandles(d.candles, k);
  const rates = { ...FALLBACK_RATES, ...fx.rates };
  const fmt = (x: number) => formatMoney(convert(x, rates[display.currency] ?? 1, display.unit, display.karat), display.currency, false, lang);
  const a = analyze({ daily, hourly: h ? scaleCandles(h.candles, k) : [], price: spot.price, fmt, lang });
  const prevClose = daily[daily.length - 2].close;

  const targets: PriceTarget[] = [];
  for (const [dir, v] of [['below', env.ALERT_BELOW], ['above', env.ALERT_ABOVE]] as const) {
    const n = Number(v);
    if (v && n > 0) targets.push({ id: `env-${dir}-${n}`, direction: dir, price: n, ...display, createdAt: 0 });
  }

  const prev = readState();
  const { messages, state } = evaluateAlerts(
    { price: spot.price, prevClose, rates, now: Date.now(), action: a?.action, summary: a?.summary },
    { enabled: true, bigMovePct: Number(env.BIG_MOVE_PCT || 1.5), signals: env.SIGNALS !== 'false', targets },
    display,
    prev,
  );

  // daily summary
  const hourStr = env.DAILY_SUMMARY_HOUR_UTC ?? '6';
  const today = new Date().toISOString().slice(0, 10);
  if (hourStr !== '' && new Date().getUTCHours() >= Number(hourStr) && state.summaryDay !== today) {
    const shown = priceIn(spot.price, rates, display);
    const priceStr = formatMoney(shown, display.currency, false, lang);
    const prefsStr = describePrefs(display, lang);
    const chg1d = formatPct(spot.price / prevClose - 1);
    const chg7d = a ? formatPct(a.stats.change7d) : '';
    const title =
      lang === 'ar'
        ? `☀️ الذهب اليوم: ${priceStr}`
        : lang === 'fr'
          ? `☀️ L'or aujourd'hui : ${priceStr}`
          : lang === 'ur'
            ? `☀️ آج سونے کی قیمت: ${priceStr}`
            : `☀️ Gold today: ${priceStr}`;
    const body =
      lang === 'ar'
        ? `${prefsStr} · ${chg1d} اليوم${a ? ` · ${chg7d} هذا الأسبوع. النصيحة: ${a.headline}.` : ''}`
        : lang === 'fr'
          ? `${prefsStr} · ${chg1d} aujourd'hui${a ? ` · ${chg7d} cette semaine. Conseil : ${a.headline}.` : ''}`
          : lang === 'ur'
            ? `${prefsStr} · آج ${chg1d}${a ? ` · اس ہفتے ${chg7d}۔ مشورہ: ${a.headline}۔` : ''}`
            : `${prefsStr} · ${chg1d} today${a ? ` · ${chg7d} this week. Advice: ${a.headline}.` : ''}`;
    messages.push({
      kind: 'summary',
      tag: 'summary',
      priority: 3,
      title,
      body,
    });
    state.summaryDay = today;
  }

  console.log(`Spot $${spot.price.toFixed(2)}/oz (${spot.source}), history ${d.source}, advice: ${a?.action ?? 'n/a'} (${a?.score ?? '-'})`);
  for (const m of messages) await publish(m);
  if (!messages.length) console.log('No alerts this time.');

  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
