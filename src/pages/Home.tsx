import { useEffect, useState } from 'preact/hooks';
import { analysis, hourly, money, prevSpot, settings, spot, status, t, toDisplay, unitLabel, updateSettings, marketOpen, sources } from '../store.ts';
import { Card, Change, Gauge, Segmented, Sparkline, ACTION_COLORS } from '../components/ui.tsx';
import { KARATS, UNITS } from '../lib/units.ts';
import { KARAT_NOTES, UNIT_TEXT } from '../lib/i18n.ts';
import type { Karat, Unit } from '../lib/types.ts';
import { timeAgo } from '../lib/format.ts';

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function HeroPrice() {
  useTick(5000);
  const s = spot.value;
  const a = analysis.value;
  const st = settings.value;
  const [flash, setFlash] = useState('');
  useEffect(() => {
    if (!s || prevSpot.value == null || prevSpot.value === s.price) return;
    setFlash(s.price > prevSpot.value ? 'flash-up' : 'flash-down');
    const id = setTimeout(() => setFlash(''), 900);
    return () => clearTimeout(id);
  }, [s?.time]);

  const h = hourly.value.slice(-24).map((c) => c.close);
  if (s && h.length) h[h.length - 1] = s.price;
  const open = marketOpen();
  return (
    <section class="card hero">
      <div class="hero-top">
        <span class="muted">{t('home.goldPrice')} · {unitLabel()}</span>
        <span class={`live ${open ? '' : 'closed'}`}>
          <i />
          {open ? t('home.live') : t('home.marketClosed')}
        </span>
      </div>
      <Segmented<Karat> small value={st.karat} options={KARATS.slice(0, 4).map((k) => ({ value: k.k, label: `${k.k}K` }))} onChange={(k) => updateSettings({ karat: k })} />
      <div class={`hero-price ${flash}`}>{s ? money(toDisplay(s.price)) : <span class="skeleton" style={{ width: '60%' }} />}</div>
      <div class="hero-sub">
        <Change value={a?.stats.change1d} big />
        <span class="muted">
          {a ? t('home.today', { amount: `${toDisplay(a.stats.price - a.stats.prevClose) >= 0 ? '+' : ''}${money(toDisplay(a.stats.price - a.stats.prevClose))}` }) : ''}
        </span>
      </div>
      <Sparkline values={h.map((x) => toDisplay(x))} height={70} />
      {a && (
        <div class="range-bar">
          <span>{t('home.low', { amount: money(toDisplay(a.stats.dayLow)) })}</span>
          <div class="range-track">
            <i style={{ insetInlineStart: `${((a.stats.price - a.stats.dayLow) / (a.stats.dayHigh - a.stats.dayLow || 1)) * 100}%` }} />
          </div>
          <span>{t('home.high', { amount: money(toDisplay(a.stats.dayHigh)) })}</span>
        </div>
      )}
      <div class="hero-foot muted">
        {s ? t('home.updated', { time: timeAgo(s.time, Date.now(), st.lang), source: sources.value.spot ?? s.source }) : status.value.error ? t('home.loadError') : t('home.loading')}
        {!open && t('home.weekendPause')}
      </div>
    </section>
  );
}

function AdviceCard() {
  const a = analysis.value;
  return (
    <Card title={t('home.whatToDo')} right={<a href="#/advice" class="link">{t('home.details')}</a>}>
      {a ? (
        <a href="#/advice" class="advice-mini">
          <Gauge score={a.score} size={200} />
          <div class="advice-text">
            <div class="advice-head" style={{ color: ACTION_COLORS[a.action] }}>{a.headline}</div>
            <p>{a.summary}</p>
            <div class="conf">
              {t('home.signalStrength')} <b>{a.confidence}%</b>
              <div class="conf-bar"><i style={{ width: `${a.confidence}%` }} /></div>
            </div>
          </div>
        </a>
      ) : (
        <div class="skeleton" style={{ height: '120px' }} />
      )}
    </Card>
  );
}

function KaratTable() {
  const s = spot.value;
  const st = settings.value;
  const a = analysis.value;
  const ut = UNIT_TEXT[st.lang] ?? UNIT_TEXT.en;
  const notes = KARAT_NOTES[st.lang] ?? KARAT_NOTES.en;
  return (
    <Card
      title={t('home.pricesPer', { perUnit: ut[st.unit].per })}
      right={<Segmented<Unit> small value={st.unit} options={(['gram', 'ounce', 'tola'] as Unit[]).map((u) => ({ value: u, label: ut[u].short }))} onChange={(u) => updateSettings({ unit: u })} />}
    >
      <table class="ktable">
        <tbody>
          {KARATS.map((k) => (
            <tr class={k.k === st.karat ? 'sel' : ''} onClick={() => updateSettings({ karat: k.k })}>
              <td>
                <span class="kbadge">{k.k}K</span>
                <span class="muted small">{notes[k.k]}</span>
              </td>
              <td class="num">{s ? money(toDisplay(s.price, k.k)) : '—'}</td>
              <td class="num"><Change value={a?.stats.change1d} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Performance() {
  const a = analysis.value;
  const items: [string, number | null | undefined][] = [
    [t('home.perf.today'), a?.stats.change1d],
    [t('home.perf.1w'), a?.stats.change7d],
    [t('home.perf.1m'), a?.stats.change30d],
    [t('home.perf.1y'), a?.stats.change1y],
  ];
  return (
    <Card title={t('home.performance')}>
      <div class="tiles">
        {items.map(([l, v]) => (
          <div class="tile">
            <span class="muted small">{l}</span>
            <Change value={v} />
          </div>
        ))}
      </div>
      {a && (
        <div class="tiles tiles-2">
          <div class="tile"><span class="muted small">{t('home.low52')}</span><b>{money(toDisplay(a.stats.low52))}</b></div>
          <div class="tile"><span class="muted small">{t('home.high52')}</span><b>{money(toDisplay(a.stats.high52))}</b></div>
        </div>
      )}
    </Card>
  );
}

function Calculator() {
  const [weight, setWeight] = useState(10);
  const [k, setK] = useState<Karat>(21);
  const [u, setU] = useState<Unit>('gram');
  const s = spot.value;
  const st = settings.value;
  const ut = UNIT_TEXT[st.lang] ?? UNIT_TEXT.en;
  const value = s ? toDisplay(s.price, k, u) * (weight || 0) : 0;
  return (
    <Card title={t('home.calc.title')}>
      <div class="calc">
        <input type="number" inputMode="decimal" min="0" value={weight} onInput={(e) => setWeight(parseFloat((e.target as HTMLInputElement).value))} aria-label={t('home.calc.weight')} />
        <select value={u} onChange={(e) => setU((e.target as HTMLSelectElement).value as Unit)} aria-label={t('home.calc.unit')}>
          {(Object.keys(UNITS) as Unit[]).map((x) => <option value={x}>{ut[x].label}</option>)}
        </select>
        <select value={k} onChange={(e) => setK(Number((e.target as HTMLSelectElement).value) as Karat)} aria-label={t('home.calc.karat')}>
          {KARATS.map((x) => <option value={x.k}>{x.k}K</option>)}
        </select>
      </div>
      <div class="calc-result">
        <span class="muted">{t('home.calc.marketValue')}</span>
        <b>{money(value)}</b>
      </div>
      <p class="muted small">{t('home.calc.note')}</p>
    </Card>
  );
}

export function Home() {
  return (
    <div class="grid">
      <div class="col">
        <HeroPrice />
        <AdviceCard />
      </div>
      <div class="col">
        <KaratTable />
        <Performance />
        <Calculator />
      </div>
    </div>
  );
}
