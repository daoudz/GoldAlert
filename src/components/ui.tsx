import type { ComponentChildren, JSX } from 'preact';
import type { Action } from '../lib/types.ts';
import { t } from '../store.ts';

// ---------------------------------------------------------------- icons

const paths: Record<string, JSX.Element> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  chart: <path d="M3 3v18h18M7 15l4-4 3 3 6-7" />,
  advice: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />,
  bell: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  refresh: <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />,
  download: <path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffe08a" />
          <stop offset=".5" stop-color="#f0b90b" />
          <stop offset="1" stop-color="#b8860b" />
        </linearGradient>
      </defs>
      <path d="M14 40h36l6 12H8z" fill="url(#lg)" />
      <path d="M22 24h20l5 12H17z" fill="url(#lg)" />
      <path d="M44 6l4 8-8 2" fill="none" stroke="#0ecb81" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M16 20l10-6 6 4 14-10" fill="none" stroke="#0ecb81" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- basics

export function Card(props: { title?: ComponentChildren; right?: ComponentChildren; class?: string; children: ComponentChildren }) {
  return (
    <section class={`card ${props.class ?? ''}`}>
      {(props.title || props.right) && (
        <div class="card-head">
          <h2>{props.title}</h2>
          {props.right}
        </div>
      )}
      {props.children}
    </section>
  );
}

export function Segmented<T extends string | number>(props: {
  value: T;
  options: { value: T; label: ComponentChildren }[];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div class={`seg ${props.small ? 'seg-sm' : ''}`} role="tablist">
      {props.options.map((o) => (
        <button key={String(o.value)} role="tab" aria-selected={o.value === props.value} class={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Change({ value, big }: { value: number | null | undefined; big?: boolean }) {
  if (value == null || !isFinite(value)) return <span class="chg">—</span>;
  const cls = value > 0.00005 ? 'up' : value < -0.00005 ? 'down' : 'flat';
  return (
    <span class={`chg ${cls} ${big ? 'chg-big' : ''}`}>
      {cls === 'up' ? '▲' : cls === 'down' ? '▼' : '•'} {Math.abs(value * 100).toFixed(2)}%
    </span>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label class="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <i />
    </label>
  );
}

// ---------------------------------------------------------------- gauge

export const ACTION_COLORS: Record<Action, string> = {
  'strong-sell': 'var(--red)',
  sell: 'var(--red-soft)',
  hold: 'var(--muted)',
  buy: 'var(--green-soft)',
  'strong-buy': 'var(--green)',
};

export function Gauge({ score, size = 220 }: { score: number; size?: number }) {
  const segs = [
    { from: -100, to: -45, c: 'var(--red)' },
    { from: -45, to: -15, c: 'var(--red-soft)' },
    { from: -15, to: 15, c: 'var(--hold)' },
    { from: 15, to: 45, c: 'var(--green-soft)' },
    { from: 45, to: 100, c: 'var(--green)' },
  ];
  const cx = 100;
  const cy = 100;
  const R = 80;
  const ang = (s: number) => Math.PI - ((s + 100) / 200) * Math.PI;
  const pt = (s: number, r: number) => [cx + r * Math.cos(ang(s)), cy - r * Math.sin(ang(s))];
  const arc = (a: number, b: number) => {
    const [x1, y1] = pt(a, R);
    const [x2, y2] = pt(b, R);
    return `M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}`;
  };
  const s = Math.max(-100, Math.min(100, score));
  const [nx, ny] = pt(s, R - 18);
  return (
    <svg class="gauge" direction="ltr" viewBox="0 0 200 118" width={size} height={size * 0.59} role="img" aria-label={t('gauge.aria', { score })}>
      {segs.map((g) => (
        <path d={arc(g.from + 1.5, g.to - 1.5)} stroke={g.c} stroke-width="16" fill="none" stroke-linecap="butt" />
      ))}
      <text x="18" y="116" class="gauge-lbl">{t('gauge.sell')}</text>
      <text x="100" y="14" class="gauge-lbl" text-anchor="middle">{t('gauge.wait')}</text>
      <text x="182" y="116" class="gauge-lbl" text-anchor="end">{t('gauge.buy')}</text>
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text)" stroke-width="4" stroke-linecap="round" class="needle" />
      <circle cx={cx} cy={cy} r="7" fill="var(--text)" />
    </svg>
  );
}

// ---------------------------------------------------------------- small charts

export function Sparkline({ values, width = 300, height = 60, color }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <svg width="100%" height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 4 - ((v - min) / span) * (height - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const c = color ?? (values[values.length - 1] >= values[0] ? 'var(--green)' : 'var(--red)');
  return (
    <svg class="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={c} stop-opacity=".35" />
          <stop offset="1" stop-color={c} stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L${width} ${height}L0 ${height}Z`} fill="url(#sg)" />
      <path d={d} fill="none" stroke={c} stroke-width="2" vector-effect="non-scaling-stroke" />
    </svg>
  );
}

/** Bars around a zero line; lowest bar (cheapest) is highlighted. */
export function PatternBars({ data, labels, highlight }: { data: number[]; labels: string[]; highlight: number | null }) {
  const max = Math.max(...data.map(Math.abs), 1e-9);
  return (
    <div class="bars">
      {data.map((v, i) => (
        <div class={`bar ${i === highlight ? 'hl' : ''}`} title={`${labels[i]}: ${(v * 100).toFixed(2)}%`}>
          <div class="bar-track">
            <div class={`bar-fill ${v < 0 ? 'neg' : 'pos'}`} style={{ height: `${(Math.abs(v) / max) * 50}%` }} />
          </div>
          <span>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

/** History + forecast band, simple SVG */
export function ForecastChart({ history, forecast }: { history: { time: number; value: number }[]; forecast: { time: number; value: number; lo: number; hi: number }[] }) {
  const W = 600;
  const H = 180;
  const all = [...history.map((h) => h.value), ...forecast.flatMap((f) => [f.lo, f.hi])];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const t0 = history[0]?.time ?? 0;
  const t1 = forecast[forecast.length - 1]?.time ?? t0 + 1;
  const x = (t: number) => ((t - t0) / (t1 - t0)) * W;
  const y = (v: number) => H - 10 - ((v - min) / (max - min || 1)) * (H - 20);
  const line = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const lastH = history[history.length - 1];
  const fc = [lastH, ...forecast];
  const band = line([[x(lastH.time), y(lastH.value)], ...forecast.map((f) => [x(f.time), y(f.hi)] as [number, number])]) +
    forecast.slice().reverse().map((f) => `L${x(f.time).toFixed(1)} ${y(f.lo).toFixed(1)}`).join('') + `L${x(lastH.time)} ${y(lastH.value)}Z`;
  return (
    <svg class="fchart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
      <path d={band} fill="var(--gold)" opacity=".15" />
      <path d={line(history.map((h) => [x(h.time), y(h.value)]))} fill="none" stroke="var(--text-2)" stroke-width="2" vector-effect="non-scaling-stroke" />
      <path d={line(fc.map((f) => [x(f.time), y(f.value)]))} fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-dasharray="6 5" vector-effect="non-scaling-stroke" />
      <line x1={x(lastH.time)} x2={x(lastH.time)} y1="0" y2={H} stroke="var(--border)" stroke-dasharray="3 3" />
    </svg>
  );
}
