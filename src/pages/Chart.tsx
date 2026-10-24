import { useEffect, useMemo, useState } from 'preact/hooks';
import { analysis, daily, loadRange, money, RANGES, settings, spot, toDisplay, unitLabel, rate } from '../store.ts';
import type { Range } from '../store.ts';
import { Card, Change, Segmented, Toggle } from '../components/ui.tsx';
import { PriceChart } from '../components/PriceChart.tsx';
import type { Candle } from '../lib/types.ts';

export function ChartPage() {
  const [range, setRange] = useState<Range>('1M');
  const [kind, setKind] = useState<'area' | 'candles'>('area');
  const [showAvg, setAvg] = useState(false);
  const [showBands, setBands] = useState(false);
  const [showForecast, setForecast] = useState(true);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [err, setErr] = useState('');
  const st = settings.value;
  const a = analysis.value;
  const s = spot.value;

  useEffect(() => {
    let alive = true;
    setErr('');
    loadRange(range)
      .then((c) => alive && setCandles(c))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [range]);

  // keep the last candle in sync with the live price
  const live = useMemo(() => {
    if (!candles.length || !s) return candles;
    const c = [...candles];
    const l = { ...c[c.length - 1] };
    l.close = s.price;
    l.high = Math.max(l.high, s.price);
    l.low = Math.min(l.low, s.price);
    c[c.length - 1] = l;
    return c;
  }, [candles, s?.price]);

  const r = rate.value;
  // only recompute the forecast overlay when the underlying daily data changes (not on every tick)
  const forecast = useMemo(() => a?.forecast, [daily.value, !!a]);
  const conv = useMemo(() => (x: number) => toDisplay(x), [st.currency, st.unit, st.karat, r]);
  const fmt = useMemo(() => (x: number) => money(x), [st.currency]);
  const first = live[0]?.open;
  const lastV = live[live.length - 1]?.close;
  const intraday = RANGES[range].interval !== '1d';
  const forecastAllowed = range !== '1D' && range !== '1W';

  return (
    <div class="stack">
      <Card>
        <div class="chart-head">
          <div>
            <div class="muted small">{unitLabel()}</div>
            <div class="chart-price">{s ? money(toDisplay(s.price)) : '—'}</div>
            <div class="small">
              <Change value={first && lastV ? lastV / first - 1 : null} /> <span class="muted">{RANGES[range].label}</span>
            </div>
          </div>
          <Segmented<'area' | 'candles'> small value={kind} options={[{ value: 'area', label: 'Line' }, { value: 'candles', label: 'Candles' }]} onChange={setKind} />
        </div>
        <Segmented<Range> value={range} options={(Object.keys(RANGES) as Range[]).map((k) => ({ value: k, label: k }))} onChange={setRange} />
        {err ? (
          <div class="empty">⚠ Could not load chart data. {err}</div>
        ) : live.length ? (
          <PriceChart
            candles={candles}
            livePrice={s?.price}
            conv={conv}
            format={fmt}
            kind={kind}
            showAvg={showAvg}
            showBands={showBands}
            forecast={showForecast && forecastAllowed ? forecast : undefined}
            intraday={intraday}
            theme={st.theme}
          />
        ) : (
          <div class="chart skeleton" />
        )}
        <div class="legend">
          {showAvg && <><span><i style={{ background: '#3b82f6' }} />20-day avg</span><span><i style={{ background: '#a855f7' }} />50-day avg</span></>}
          {showBands && <span><i style={{ background: 'var(--text-3)' }} />Normal range</span>}
          {showForecast && forecastAllowed && <span><i style={{ background: 'var(--gold)' }} />7-day forecast</span>}
        </div>
      </Card>
      <Card title="Chart tools">
        <Toggle label="Show 7-day forecast (Month view and longer)" checked={showForecast} onChange={setForecast} />
        <Toggle label="Show moving averages (trend lines)" checked={showAvg} onChange={setAvg} />
        <Toggle label="Show normal price range (Bollinger bands)" checked={showBands} onChange={setBands} />
        <p class="muted small">
          Tip: when the price touches the bottom of the normal range in a rising market it is often a good moment to buy;
          touching the top often means it is expensive.
        </p>
      </Card>
    </div>
  );
}
