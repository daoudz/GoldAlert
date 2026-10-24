import { analysis, daily, money, settings, spot, unitLabel, updateNotify, rate } from '../store.ts';
import { Card, Gauge, Icon, PatternBars, ForecastChart, ACTION_COLORS, Change } from '../components/ui.tsx';
import { formatDay, formatHour, WEEKDAYS } from '../lib/format.ts';
import { convert } from '../lib/units.ts';
import type { PriceTarget } from '../lib/types.ts';
import { useState } from 'preact/hooks';

export function addTarget(direction: 'below' | 'above', price: number) {
  const st = settings.value;
  const t: PriceTarget = {
    id: Math.random().toString(36).slice(2, 10),
    direction,
    price: Math.round(price * 100) / 100,
    currency: st.currency,
    unit: st.unit,
    karat: st.karat,
    createdAt: Date.now(),
  };
  updateNotify({ targets: [...st.notify.targets, t] });
}

function Disclaimer() {
  return (
    <p class="disclaimer">
      <Icon name="info" size={16} /> This advice is generated automatically from price history using common technical indicators
      and a simple forecasting model. It is <b>not financial advice</b> and cannot predict news or sudden events. Only invest money you can afford to keep for a while.
    </p>
  );
}

export function Advice() {
  const a = analysis.value;
  const s = spot.value;
  const st = settings.value;
  const [added, setAdded] = useState('');
  if (!a || !s) {
    return (
      <div class="stack">
        <Card><div class="skeleton" style={{ height: '220px' }} /></Card>
      </div>
    );
  }
  const r = rate.value;
  const disp = (x: number) => convert(x, r, st.unit, st.karat);
  const hist = daily.value.slice(-30).map((c) => ({ time: c.time, value: disp(c.close) }));
  if (hist.length) hist[hist.length - 1] = { ...hist[hist.length - 1], value: disp(s.price) };
  const fc = a.forecast.map((f) => ({ time: f.time, value: disp(f.value), lo: disp(f.lo), hi: disp(f.hi) }));
  const low = a.forecast[a.best.forecastLowIndex];
  const wk = a.best.weekdays;
  const hours = a.best.hours;
  const sortedDays = [...wk].filter((d) => d.n).sort((x, y) => x.avg - y.avg);
  const spread = sortedDays.length ? sortedDays[sortedDays.length - 1].avg - sortedDays[0].avg : 0;

  const alertBtn = (dir: 'below' | 'above', usd: number) => (
    <button
      class="btn btn-sm"
      onClick={() => {
        addTarget(dir, disp(usd));
        setAdded(dir);
      }}
    >
      🔔 {added === dir ? 'Alert added' : 'Alert me'}
    </button>
  );

  return (
    <div class="grid">
      <div class="col">
        <Card class="advice-hero">
          <Gauge score={a.score} size={260} />
          <div class="advice-head big" style={{ color: ACTION_COLORS[a.action] }}>{a.headline}</div>
          <p class="center">{a.summary}</p>
          <div class="conf center">
            Signal strength <b>{a.confidence}%</b>
            <div class="conf-bar"><i style={{ width: `${a.confidence}%` }} /></div>
          </div>
        </Card>

        <Card title="Why? (in plain words)">
          <ul class="factors">
            {a.factors.map((f) => {
              const cls = f.score > 0.2 ? 'pos' : f.score < -0.2 ? 'neg' : 'neu';
              return (
                <li class={cls}>
                  <span class="f-icon">{cls === 'pos' ? '👍' : cls === 'neg' ? '👎' : '➖'}</span>
                  <div>
                    <b>{f.title}</b>
                    <p>{f.detail}</p>
                    <div class="f-bar"><i style={{ width: `${Math.abs(f.score) * 50}%`, [f.score >= 0 ? 'left' : 'right']: '50%' }} class={f.score >= 0 ? 'pos' : 'neg'} /></div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p class="muted small">👍 = favours buying now · 👎 = favours waiting or selling</p>
        </Card>
      </div>

      <div class="col">
        <Card title="Smart price targets">
          <p class="muted small">{unitLabel()}</p>
          <div class="target-row buy">
            <div>
              <span class="muted small">Good price to BUY</span>
              <b>below {money(disp(a.targets.buyBelow))}</b>
            </div>
            {alertBtn('below', a.targets.buyBelow)}
          </div>
          <div class="target-row sell">
            <div>
              <span class="muted small">Good price to SELL</span>
              <b>above {money(disp(a.targets.sellAbove))}</b>
            </div>
            {alertBtn('above', a.targets.sellAbove)}
          </div>
          <p class="muted small">
            Recent floor (support): {money(disp(a.targets.support))} · Recent ceiling (resistance): {money(disp(a.targets.resistance))}
          </p>
        </Card>

        <Card title="7-day forecast">
          <ForecastChart history={hist} forecast={fc} />
          <div class="fc-list">
            {fc.map((f, i) => (
              <div class={`fc-item ${i === a.best.forecastLowIndex ? 'hl' : ''}`}>
                <span class="muted small">{formatDay(f.time)}</span>
                <b>{money(f.value)}</b>
              </div>
            ))}
          </div>
          <p class="small">
            Expected change in a week: <Change value={a.forecastChange} />. The shaded area shows where the price will likely stay (80% chance).
            {low && <> Lowest expected price: <b>{formatDay(low.time)}</b>.</>}
          </p>
        </Card>

        <Card title="Best time to buy">
          <div class="best-grid">
            <div class="best-pill">
              <span class="muted small">Cheapest day (history)</span>
              <b>{WEEKDAYS[a.best.cheapestDay]}</b>
            </div>
            <div class="best-pill">
              <span class="muted small">Cheapest hour (your time)</span>
              <b>{a.best.cheapestHour != null ? formatHour(a.best.cheapestHour) : '—'}</b>
            </div>
          </div>
          <h3>By weekday (last year)</h3>
          <PatternBars data={wk.map((d) => d.avg)} labels={WEEKDAYS.map((d) => d.slice(0, 2))} highlight={a.best.cheapestDay} />
          {hours.length > 0 && (
            <>
              <h3>By hour of day (last ~6 weeks)</h3>
              <PatternBars data={hours.map((h) => h.avg)} labels={hours.map((h) => (h.key % 3 === 0 ? String(h.key) : ''))} highlight={a.best.cheapestHour} />
            </>
          )}
          <p class="muted small">
            Bars below the line mean gold was usually cheaper than average at that time. These patterns are small
            (about {(spread * 100).toFixed(2)}% between best and worst day) — use them only to fine-tune timing, the advice above matters more.
          </p>
        </Card>

        <Card title="Key numbers">
          <div class="kv">
            <span>Strength index (RSI)</span><b>{a.stats.rsi.toFixed(0)} / 100</b>
            <span>20-day average</span><b>{money(disp(a.stats.sma20))}</b>
            <span>50-day average</span><b>{money(disp(a.stats.sma50))}</b>
            {a.stats.sma200 != null && <><span>200-day average</span><b>{money(disp(a.stats.sma200))}</b></>}
            <span>Typical daily move</span><b>±{(a.stats.vol * 100).toFixed(2)}%</b>
            <span>Price per ounce (USD)</span><b>${s.price.toFixed(2)}</b>
          </div>
        </Card>
        <Disclaimer />
      </div>
    </div>
  );
}
