import { analysis, daily, money, settings, spot, t, unitLabel, updateNotify, rate } from '../store.ts';
import { Card, Gauge, Icon, PatternBars, ForecastChart, ACTION_COLORS, Change } from '../components/ui.tsx';
import { formatDay, formatHour } from '../lib/format.ts';
import { WEEKDAYS_I18N, WEEKDAYS_SHORT_I18N } from '../lib/i18n.ts';
import { convert } from '../lib/units.ts';
import type { PriceTarget } from '../lib/types.ts';
import { useState } from 'preact/hooks';

export function addTarget(direction: 'below' | 'above', price: number) {
  const st = settings.value;
  const target: PriceTarget = {
    id: Math.random().toString(36).slice(2, 10),
    direction,
    price: Math.round(price * 100) / 100,
    currency: st.currency,
    unit: st.unit,
    karat: st.karat,
    createdAt: Date.now(),
  };
  updateNotify({ targets: [...st.notify.targets, target] });
}

function Disclaimer() {
  return (
    <p class="disclaimer">
      <Icon name="info" size={16} /> <span>{t('advice.disclaimer')}</span>
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
  const weekdays = WEEKDAYS_I18N[st.lang] ?? WEEKDAYS_I18N.en;
  const weekdaysShort = WEEKDAYS_SHORT_I18N[st.lang] ?? WEEKDAYS_SHORT_I18N.en;

  const alertBtn = (dir: 'below' | 'above', usd: number) => (
    <button
      class="btn btn-sm"
      onClick={() => {
        addTarget(dir, disp(usd));
        setAdded(dir);
      }}
    >
      🔔 {added === dir ? t('advice.alertAdded') : t('advice.alertMe')}
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
            {t('home.signalStrength')} <b>{a.confidence}%</b>
            <div class="conf-bar"><i style={{ width: `${a.confidence}%` }} /></div>
          </div>
        </Card>

        <Card title={t('advice.why')}>
          <ul class="factors">
            {a.factors.map((f) => {
              const cls = f.score > 0.2 ? 'pos' : f.score < -0.2 ? 'neg' : 'neu';
              return (
                <li class={cls}>
                  <span class="f-icon">{cls === 'pos' ? '👍' : cls === 'neg' ? '👎' : '➖'}</span>
                  <div style={{ flex: 1 }}>
                    <b>{f.title}</b>
                    <p>{f.detail}</p>
                    <div class="f-bar"><i style={{ width: `${Math.abs(f.score) * 50}%`, [f.score >= 0 ? 'left' : 'right']: '50%' }} class={f.score >= 0 ? 'pos' : 'neg'} /></div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p class="muted small">{t('advice.legend')}</p>
        </Card>
      </div>

      <div class="col">
        <Card title={t('advice.targets')}>
          <p class="muted small">{unitLabel()}</p>
          <div class="target-row buy">
            <div>
              <span class="muted small">{t('advice.goodBuy')}</span>
              <b>{t('advice.below', { price: money(disp(a.targets.buyBelow)) })}</b>
            </div>
            {alertBtn('below', a.targets.buyBelow)}
          </div>
          <div class="target-row sell">
            <div>
              <span class="muted small">{t('advice.goodSell')}</span>
              <b>{t('advice.above', { price: money(disp(a.targets.sellAbove)) })}</b>
            </div>
            {alertBtn('above', a.targets.sellAbove)}
          </div>
          <p class="muted small">
            {t('advice.floorCeiling', { support: money(disp(a.targets.support)), resistance: money(disp(a.targets.resistance)) })}
          </p>
        </Card>

        <Card title={t('advice.forecastTitle')}>
          <ForecastChart history={hist} forecast={fc} />
          <div class="fc-list">
            {fc.map((f, i) => (
              <div class={`fc-item ${i === a.best.forecastLowIndex ? 'hl' : ''}`}>
                <span class="muted small">{formatDay(f.time, st.lang)}</span>
                <b>{money(f.value)}</b>
              </div>
            ))}
          </div>
          <p class="small">
            {t('advice.expectedChange')} <Change value={a.forecastChange} />. {t('advice.bandNote')}
            {low && <> {t('advice.lowestExpected')} <b>{formatDay(low.time, st.lang)}</b>.</>}
          </p>
        </Card>

        <Card title={t('advice.bestTime')}>
          <div class="best-grid">
            <div class="best-pill">
              <span class="muted small">{t('advice.cheapestDay')}</span>
              <b>{weekdays[a.best.cheapestDay]}</b>
            </div>
            <div class="best-pill">
              <span class="muted small">{t('advice.cheapestHour')}</span>
              <b>{a.best.cheapestHour != null ? formatHour(a.best.cheapestHour, st.lang) : '—'}</b>
            </div>
          </div>
          <h3>{t('advice.byWeekday')}</h3>
          <PatternBars data={wk.map((d) => d.avg)} labels={weekdaysShort} highlight={a.best.cheapestDay} />
          {hours.length > 0 && (
            <>
              <h3>{t('advice.byHour')}</h3>
              <PatternBars data={hours.map((h) => h.avg)} labels={hours.map((h) => (h.key % 3 === 0 ? String(h.key) : ''))} highlight={a.best.cheapestHour} />
            </>
          )}
          <p class="muted small">{t('advice.patternNote', { pct: (spread * 100).toFixed(2) })}</p>
        </Card>

        <Card title={t('advice.keyNumbers')}>
          <div class="kv">
            <span>{t('advice.rsi')}</span><b>{a.stats.rsi.toFixed(0)} / 100</b>
            <span>{t('advice.sma20')}</span><b>{money(disp(a.stats.sma20))}</b>
            <span>{t('advice.sma50')}</span><b>{money(disp(a.stats.sma50))}</b>
            {a.stats.sma200 != null && <><span>{t('advice.sma200')}</span><b>{money(disp(a.stats.sma200))}</b></>}
            <span>{t('advice.volatility')}</span><b>±{(a.stats.vol * 100).toFixed(2)}%</b>
            <span>{t('advice.usdOz')}</span><b>${s.price.toFixed(2)}</b>
          </div>
        </Card>
        <Disclaimer />
      </div>
    </div>
  );
}
