/**
 * Alert rules shared by the app, the service worker (background checks) and the
 * GitHub Actions push job. Pure: takes inputs + previous state, returns messages + new state.
 */
import type { Action, DisplayPrefs, NotifySettings, PriceTarget } from './types.ts';
import { actionGroup, ACTION_TEXT } from './analysis.ts';
import { convert, UNITS } from './units.ts';
import { formatMoney, formatPct } from './format.ts';

export interface AlertState {
  /** UTC date (YYYY-MM-DD) of the last big-move bucket */
  moveDay?: string;
  /** signed multiple of bigMovePct already notified today */
  moveBucket?: number;
  lastAction?: Action;
  /** ids of price targets that already fired */
  firedTargets?: string[];
  /** UTC date of the last daily summary (push job only) */
  summaryDay?: string;
}

export interface AlertMessage {
  kind: 'move' | 'signal' | 'target' | 'summary';
  title: string;
  body: string;
  tag: string;
  /** 1 (min) .. 5 (max), ntfy-compatible */
  priority: number;
}

export interface AlertInput {
  /** live USD/oz */
  price: number;
  /** yesterday's close, USD/oz */
  prevClose: number;
  rates: Record<string, number>;
  now: number;
  action?: Action;
  summary?: string;
}

export function priceIn(usdOz: number, rates: Record<string, number>, p: { currency: string; unit: PriceTarget['unit']; karat: PriceTarget['karat'] }): number {
  return convert(usdOz, rates[p.currency] ?? 1, p.unit, p.karat);
}

export function describePrefs(p: DisplayPrefs): string {
  return `${p.karat}K per ${UNITS[p.unit].label.toLowerCase()}`;
}

export function evaluateAlerts(
  input: AlertInput,
  notify: NotifySettings,
  display: DisplayPrefs,
  prev: AlertState,
): { messages: AlertMessage[]; state: AlertState } {
  const state: AlertState = { ...prev, firedTargets: [...(prev.firedTargets ?? [])] };
  const messages: AlertMessage[] = [];
  const shown = priceIn(input.price, input.rates, display);
  const shownStr = `${formatMoney(shown, display.currency)} (${describePrefs(display)})`;

  // --- big daily moves
  if (input.prevClose > 0 && notify.bigMovePct > 0) {
    const chg = input.price / input.prevClose - 1;
    const day = new Date(input.now).toISOString().slice(0, 10);
    const bucket = Math.sign(chg) * Math.floor(Math.abs(chg * 100) / notify.bigMovePct);
    if (state.moveDay !== day) {
      state.moveDay = day;
      state.moveBucket = 0;
    }
    const prevB = state.moveBucket ?? 0;
    if (bucket !== 0 && (Math.abs(bucket) > Math.abs(prevB) || Math.sign(bucket) !== Math.sign(prevB))) {
      const upMove = chg > 0;
      messages.push({
        kind: 'move',
        tag: 'move',
        priority: Math.abs(chg * 100) >= notify.bigMovePct * 2 ? 5 : 4,
        title: `${upMove ? '📈 Gold jumped' : '📉 Gold dropped'} ${formatPct(chg)} today`,
        body: `Now ${shownStr}. ${upMove ? 'Holders may want to check if it is time to sell.' : 'Could be a buying chance — check the advice in the app.'}`,
      });
      state.moveBucket = bucket;
    }
  }

  // --- buy / sell signal changes
  if (input.action) {
    const g = actionGroup(input.action);
    const pg = state.lastAction ? actionGroup(state.lastAction) : undefined;
    if (notify.signals && pg && g !== pg && g !== 'hold') {
      messages.push({
        kind: 'signal',
        tag: 'signal',
        priority: input.action.startsWith('strong') ? 5 : 4,
        title: `${g === 'buy' ? '🟢' : '🔴'} ${ACTION_TEXT[input.action].headline}`,
        body: `${input.summary ?? ACTION_TEXT[input.action].summary} Price: ${shownStr}.`,
      });
    }
    state.lastAction = input.action;
  }

  // --- user price targets
  for (const t of notify.targets) {
    if (state.firedTargets!.includes(t.id)) continue;
    const v = priceIn(input.price, input.rates, t);
    const hit = t.direction === 'below' ? v <= t.price : v >= t.price;
    if (hit) {
      state.firedTargets!.push(t.id);
      messages.push({
        kind: 'target',
        tag: `target-${t.id}`,
        priority: 5,
        title: `🎯 Gold is ${t.direction} ${formatMoney(t.price, t.currency)}`,
        body: `${t.karat}K per ${UNITS[t.unit].label.toLowerCase()} is now ${formatMoney(v, t.currency)} — your price alert was reached.`,
      });
    }
  }
  // forget fired ids of deleted targets
  state.firedTargets = state.firedTargets!.filter((id) => notify.targets.some((t) => t.id === id));

  return { messages, state };
}
