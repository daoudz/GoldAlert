/** Shared types. This file (and the rest of src/lib) must stay free of browser-only
 *  APIs and npm imports so it can also run in Node (scripts/check-alerts.ts) and the
 *  service worker. Use only erasable TypeScript syntax (no enums / namespaces). */

export interface Candle {
  /** Unix time in seconds (UTC), start of the candle */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Spot {
  /** USD per troy ounce of fine (24K) gold */
  price: number;
  /** ms timestamp when fetched */
  time: number;
  source: string;
}

export type Unit = 'gram' | 'ounce' | 'kg' | 'tola';
export type Karat = 24 | 22 | 21 | 18 | 14;
export type Action = 'strong-buy' | 'buy' | 'hold' | 'sell' | 'strong-sell';

export interface PriceTarget {
  id: string;
  direction: 'below' | 'above';
  /** price expressed in the currency/unit/karat below */
  price: number;
  currency: string;
  unit: Unit;
  karat: Karat;
  createdAt: number;
}

export interface DisplayPrefs {
  currency: string;
  unit: Unit;
  karat: Karat;
}

export interface NotifySettings {
  enabled: boolean;
  /** notify when the daily change crosses multiples of this percentage */
  bigMovePct: number;
  /** notify when the advice switches to buy or sell */
  signals: boolean;
  targets: PriceTarget[];
}

export interface Settings extends DisplayPrefs {
  theme: 'dark' | 'light';
  refreshSec: number;
  notify: NotifySettings;
  ntfyTopic: string;
}
