import { useEffect, useRef } from 'preact/hooks';
import {
  createChart, AreaSeries, CandlestickSeries, LineSeries, ColorType, CrosshairMode, LineStyle,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';
import type { Candle, Lang } from '../lib/types.ts';
import type { ForecastPoint } from '../lib/analysis.ts';
import { sma, bollinger } from '../lib/analysis.ts';
import { localeFor, tr } from '../lib/i18n.ts';

export interface ChartProps {
  candles: Candle[];
  /** latest live USD/oz price, applied to the last bar */
  livePrice?: number;
  /** converts USD/oz into the display value */
  conv: (usdOz: number) => number;
  format: (v: number) => string;
  kind: 'area' | 'candles';
  showAvg: boolean;
  showBands: boolean;
  forecast?: ForecastPoint[];
  intraday: boolean;
  theme: string;
  lang: Lang;
}

const TZ = -new Date().getTimezoneOffset() * 60;
const t = (sec: number) => (sec + TZ) as UTCTimestamp;

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function PriceChart(p: ChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const main = useRef<ISeriesApi<SeriesType> | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: css('--text-2'), fontFamily: 'Inter, system-ui, sans-serif', attributionLogo: true },
      grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: p.intraday, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Magnet },
      localization: { priceFormatter: p.format, locale: localeFor(p.lang) },
      handleScale: { axisPressedMouseMove: false },
    });
    chart.current = c;
    const green = css('--green');
    const red = css('--red');
    const gold = css('--gold');

    const series: ISeriesApi<SeriesType>[] = [];
    const conv = (c: Candle) => ({ time: t(c.time), open: p.conv(c.open), high: p.conv(c.high), low: p.conv(c.low), close: p.conv(c.close) });
    if (p.kind === 'candles') {
      const s = c.addSeries(CandlestickSeries, { upColor: green, downColor: red, wickUpColor: green, wickDownColor: red, borderVisible: false });
      s.setData(p.candles.map(conv));
      series.push(s);
    } else {
      const s = c.addSeries(AreaSeries, { lineColor: gold, topColor: gold + '55', bottomColor: gold + '00', lineWidth: 2 });
      s.setData(p.candles.map((k) => ({ time: t(k.time), value: p.conv(k.close) })));
      series.push(s);
    }

    const closes = p.candles.map((k) => k.close);
    const lineData = (arr: (number | null)[]) =>
      arr.map((v, i) => (v == null ? null : { time: t(p.candles[i].time), value: p.conv(v) })).filter((x): x is { time: UTCTimestamp; value: number } => !!x);

    if (p.showAvg) {
      c.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(lineData(sma(closes, 20)));
      c.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(lineData(sma(closes, 50)));
    }
    if (p.showBands) {
      const bb = bollinger(closes);
      const o = { color: css('--text-3'), lineWidth: 1 as const, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      c.addSeries(LineSeries, o).setData(lineData(bb.upper));
      c.addSeries(LineSeries, o).setData(lineData(bb.lower));
    }
    if (p.forecast?.length && p.candles.length) {
      const lastC = p.candles[p.candles.length - 1];
      const start = { time: t(lastC.time), value: p.conv(lastC.close) };
      const f = (sel: (x: ForecastPoint) => number) => [start, ...p.forecast!.filter((x) => x.time > lastC.time).map((x) => ({ time: t(x.time), value: p.conv(sel(x)) }))];
      c.addSeries(LineSeries, { color: gold, lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, title: tr(p.lang, 'chart.forecastSeries') }).setData(f((x) => x.value));
      const bo = { color: gold + '88', lineWidth: 1 as const, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      c.addSeries(LineSeries, bo).setData(f((x) => x.hi));
      c.addSeries(LineSeries, bo).setData(f((x) => x.lo));
    }
    c.timeScale().fitContent();
    main.current = series[0];
    return () => {
      c.remove();
      chart.current = null;
      main.current = null;
    };
  }, [p.candles, p.kind, p.showAvg, p.showBands, p.forecast, p.theme, p.lang, p.conv, p.intraday]);

  // live tick: update only the last bar (keeps the user's zoom / scroll)
  useEffect(() => {
    const s = main.current;
    const lastC = p.candles[p.candles.length - 1];
    if (!s || !lastC || !p.livePrice) return;
    const v = p.conv(p.livePrice);
    try {
      if (p.kind === 'candles') {
        s.update({ time: t(lastC.time), open: p.conv(lastC.open), high: Math.max(p.conv(lastC.high), v), low: Math.min(p.conv(lastC.low), v), close: v } as any);
      } else {
        s.update({ time: t(lastC.time), value: v } as any);
      }
    } catch {
      /* ignore out-of-order updates */
    }
  }, [p.livePrice, p.candles, p.kind, p.conv]);

  return <div class="chart" ref={el} />;
}
