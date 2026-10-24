import { useEffect, useMemo, useState } from 'preact/hooks';
import { analysis, daily, loadRange, money, RANGES, settings, spot, t, toDisplay, unitLabel, rate } from '../store.ts';
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
  const fmt = useMemo(() => (x: number) => money(x), [st.currency, st.lang]);
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
              <Change value={first && lastV ? lastV / first - 1 : null} /> <span class="muted">{t(RANGES[range].labelKey)}</span>
            </div>
          </div>
          <Segmented<'area' | 'candles'> small value={kind} options={[{ value: 'area', label: t('chart.line') }, { value: 'candles', label: t('chart.candles') }]} onChange={setKind} />
        </div>
        <Segmented<Range> value={range} options={(Object.keys(RANGES) as Range[]).map((k) => ({ value: k, label: k }))} onChange={setRange} />
        {err ? (
          <div class="empty">{t('chart.loadError')} {err}</div>
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
            lang={st.lang}
          />
        ) : (
          <div class="chart skeleton" />
        )}
        <div class="legend">
          {showAvg && <><span><i style={{ background: '#3b82f6' }} />{t('chart.sma20')}</span><span><i style={{ background: '#a855f7' }} />{t('chart.sma50')}</span></>}
          {showBands && <span><i style={{ background: 'var(--text-3)' }} />{t('chart.bands')}</span>}
          {showForecast && forecastAllowed && <span><i style={{ background: 'var(--gold)' }} />{t('chart.forecast')}</span>}
        </div>
      </Card>
      <Card title={t('chart.tools')}>
        <Toggle label={t('chart.toggleForecast')} checked={showForecast} onChange={setForecast} />
        <Toggle label={t('chart.toggleAvg')} checked={showAvg} onChange={setAvg} />
        <Toggle label={t('chart.toggleBands')} checked={showBands} onChange={setBands} />
        <p class="muted small">{t('chart.tip')}</p>
      </Card>
    </div>
  );
}
