import { useEffect, useState } from 'preact/hooks';
import { analysis, hourly, money, prevSpot, settings, spot, status, toDisplay, unitLabel, updateSettings, marketOpen, sources } from '../store.ts';
import { Card, Change, Gauge, Icon, Segmented, Sparkline, ACTION_COLORS } from '../components/ui.tsx';
import { KARATS, UNITS } from '../lib/units.ts';
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
        <span class="muted">Gold price · {unitLabel()}</span>
        <span class={`live ${open ? '' : 'closed'}`}>
          <i />
          {open ? 'LIVE' : 'Market closed'}
        </span>
      </div>
      <Segmented<Karat> small value={st.karat} options={KARATS.slice(0, 4).map((k) => ({ value: k.k, label: `${k.k}K` }))} onChange={(k) => updateSettings({ karat: k })} />
      <div class={`hero-price ${flash}`}>{s ? money(toDisplay(s.price)) : <span class="skeleton" style={{ width: '60%' }} />}</div>
      <div class="hero-sub">
        <Change value={a?.stats.change1d} big />
        <span class="muted">
          {a ? `${toDisplay(a.stats.price - a.stats.prevClose) >= 0 ? '+' : ''}${money(toDisplay(a.stats.price - a.stats.prevClose))} today` : ''}
        </span>
      </div>
      <Sparkline values={h.map((x) => toDisplay(x))} height={70} />
      {a && (
        <div class="range-bar">
          <span>Low {money(toDisplay(a.stats.dayLow))}</span>
          <div class="range-track">
            <i style={{ left: `${((a.stats.price - a.stats.dayLow) / (a.stats.dayHigh - a.stats.dayLow || 1)) * 100}%` }} />
          </div>
          <span>High {money(toDisplay(a.stats.dayHigh))}</span>
        </div>
      )}
      <div class="hero-foot muted">
        {s ? `Updated ${timeAgo(s.time)} · ${sources.value.spot ?? s.source}` : status.value.error ? '⚠ Could not load prices' : 'Loading live price…'}
        {!open && ' · Prices pause on weekends'}
      </div>
    </section>
  );
}

function AdviceCard() {
  const a = analysis.value;
  return (
    <Card title="What should I do?" right={<a href="#/advice" class="link">Details →</a>}>
      {a ? (
        <a href="#/advice" class="advice-mini">
          <Gauge score={a.score} size={200} />
          <div class="advice-text">
            <div class="advice-head" style={{ color: ACTION_COLORS[a.action] }}>{a.headline}</div>
            <p>{a.summary}</p>
            <div class="conf">
              Signal strength <b>{a.confidence}%</b>
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
  return (
    <Card title={`Prices per ${UNITS[st.unit].label.toLowerCase()}`} right={<Segmented<Unit> small value={st.unit} options={(['gram', 'ounce', 'tola'] as Unit[]).map((u) => ({ value: u, label: UNITS[u].short }))} onChange={(u) => updateSettings({ unit: u })} />}>
      <table class="ktable">
        <tbody>
          {KARATS.map((k) => (
            <tr class={k.k === st.karat ? 'sel' : ''} onClick={() => updateSettings({ karat: k.k })}>
              <td>
                <span class="kbadge">{k.k}K</span>
                <span class="muted small">{k.note}</span>
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
    ['Today', a?.stats.change1d],
    ['1 week', a?.stats.change7d],
    ['1 month', a?.stats.change30d],
    ['1 year', a?.stats.change1y],
  ];
  return (
    <Card title="Performance">
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
          <div class="tile"><span class="muted small">52-week low</span><b>{money(toDisplay(a.stats.low52))}</b></div>
          <div class="tile"><span class="muted small">52-week high</span><b>{money(toDisplay(a.stats.high52))}</b></div>
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
  const value = s ? toDisplay(s.price, k, u) * (weight || 0) : 0;
  return (
    <Card title="How much is my gold worth?">
      <div class="calc">
        <input type="number" inputMode="decimal" min="0" value={weight} onInput={(e) => setWeight(parseFloat((e.target as HTMLInputElement).value))} aria-label="Weight" />
        <select value={u} onChange={(e) => setU((e.target as HTMLSelectElement).value as Unit)} aria-label="Unit">
          {(Object.keys(UNITS) as Unit[]).map((x) => <option value={x}>{UNITS[x].label}</option>)}
        </select>
        <select value={k} onChange={(e) => setK(Number((e.target as HTMLSelectElement).value) as Karat)} aria-label="Karat">
          {KARATS.map((x) => <option value={x.k}>{x.k}K</option>)}
        </select>
      </div>
      <div class="calc-result">
        <span class="muted">Market value</span>
        <b>{money(value)}</b>
      </div>
      <p class="muted small">Shops usually add a making charge when selling and pay a bit less than market value when buying.</p>
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
