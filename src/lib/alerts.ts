/**
 * Alert rules shared by the app, the service worker (background checks) and the
 * GitHub Actions push job. Pure: takes inputs + previous state, returns messages + new state.
 */
import type { Action, DisplayPrefs, Lang, NotifySettings, PriceTarget } from './types.ts';
import { actionGroup } from './analysis.ts';
import { convert } from './units.ts';
import { formatMoney, formatPct } from './format.ts';
import { ACTION_I18N, formatPrefsShort } from './i18n.ts';

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

export function describePrefs(p: DisplayPrefs, lang: Lang = p.lang ?? 'en'): string {
  return formatPrefsShort(p.karat, p.unit, lang);
}

export function evaluateAlerts(
  input: AlertInput,
  notify: NotifySettings,
  display: DisplayPrefs,
  prev: AlertState,
): { messages: AlertMessage[]; state: AlertState } {
  const lang: Lang = display.lang ?? 'en';
  const state: AlertState = { ...prev, firedTargets: [...(prev.firedTargets ?? [])] };
  const messages: AlertMessage[] = [];
  const shown = priceIn(input.price, input.rates, display);
  const shownStr = `${formatMoney(shown, display.currency, false, lang)} (${describePrefs(display, lang)})`;

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
      const pctStr = formatPct(chg);
      let title: string;
      let body: string;
      if (lang === 'ar') {
        title = `${upMove ? '📈 قفز الذهب' : '📉 انخفض الذهب'} ${pctStr} اليوم`;
        body = `الآن ${shownStr}. ${upMove ? 'قد يرغب حائزو الذهب في التحقق مما إذا كان الوقت مناسباً للبيع.' : 'قد تكون فرصة للشراء — راجع النصيحة في التطبيق.'}`;
      } else if (lang === 'fr') {
        title = `${upMove ? "📈 L'or a bondi de" : "📉 L'or a reculé de"} ${pctStr} aujourd'hui`;
        body = `Actuellement ${shownStr}. ${upMove ? "Les détenteurs peuvent vérifier s'il est temps de vendre." : "Une opportunité d'achat potentielle — consultez le conseil dans l'application."}`;
      } else if (lang === 'ur') {
        title = `${upMove ? '📈 سونا بڑھ گیا' : '📉 سونا کم ہو گیا'} آج ${pctStr}`;
        body = `ابھی ${shownStr}۔ ${upMove ? 'سونا رکھنے والے چیک کریں کہ آیا بیچنے کا وقت ہے۔' : 'خریداری کا موقع ہو سکتا ہے — ایپ میں مشورہ دیکھیں۔'}`;
      } else {
        title = `${upMove ? '📈 Gold jumped' : '📉 Gold dropped'} ${pctStr} today`;
        body = `Now ${shownStr}. ${upMove ? 'Holders may want to check if it is time to sell.' : 'Could be a buying chance — check the advice in the app.'}`;
      }
      messages.push({
        kind: 'move',
        tag: 'move',
        priority: Math.abs(chg * 100) >= notify.bigMovePct * 2 ? 5 : 4,
        title,
        body,
      });
      state.moveBucket = bucket;
    }
  }

  // --- buy / sell signal changes
  if (input.action) {
    const g = actionGroup(input.action);
    const pg = state.lastAction ? actionGroup(state.lastAction) : undefined;
    if (notify.signals && pg && g !== pg && g !== 'hold') {
      const actText = ACTION_I18N[lang]?.[input.action] ?? ACTION_I18N.en[input.action];
      const priceWord = lang === 'ar' ? 'السعر' : lang === 'fr' ? 'Prix' : lang === 'ur' ? 'قیمت' : 'Price';
      messages.push({
        kind: 'signal',
        tag: 'signal',
        priority: input.action.startsWith('strong') ? 5 : 4,
        title: `${g === 'buy' ? '🟢' : '🔴'} ${actText.headline}`,
        body: `${input.summary ?? actText.summary} ${priceWord}: ${shownStr}.`,
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
      const tPrice = formatMoney(t.price, t.currency, false, lang);
      const vPrice = formatMoney(v, t.currency, false, lang);
      const prefsStr = formatPrefsShort(t.karat, t.unit, lang);
      let title: string;
      let body: string;
      if (lang === 'ar') {
        title = `🎯 الذهب ${t.direction === 'below' ? 'أقل من' : 'أعلى من'} ${tPrice}`;
        body = `${prefsStr} الآن ${vPrice} — تم الوصول إلى تنبيه السعر الخاص بك.`;
      } else if (lang === 'fr') {
        title = `🎯 L'or est ${t.direction === 'below' ? 'sous' : 'au-dessus de'} ${tPrice}`;
        body = `${prefsStr} est maintenant à ${vPrice} — votre alerte de prix est atteinte.`;
      } else if (lang === 'ur') {
        title = `🎯 سونا ${tPrice} سے ${t.direction === 'below' ? 'نیچے' : 'اوپر'} ہے`;
        body = `${prefsStr} اب ${vPrice} ہے — آپ کا قیمت الرٹ پورا ہو گیا۔`;
      } else {
        title = `🎯 Gold is ${t.direction} ${tPrice}`;
        body = `${prefsStr} is now ${vPrice} — your price alert was reached.`;
      }
      messages.push({
        kind: 'target',
        tag: `target-${t.id}`,
        priority: 5,
        title,
        body,
      });
    }
  }
  // forget fired ids of deleted targets
  state.firedTargets = state.firedTargets!.filter((id) => notify.targets.some((t) => t.id === id));

  return { messages, state };
}
