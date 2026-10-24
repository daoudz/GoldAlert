import type { Karat, Unit } from './types.ts';

export const OZ_GRAMS = 31.1034768;

export const UNITS: Record<Unit, { label: string; short: string; grams: number }> = {
  gram: { label: 'Gram', short: 'g', grams: 1 },
  ounce: { label: 'Ounce', short: 'oz', grams: OZ_GRAMS },
  tola: { label: 'Tola', short: 'tola', grams: 11.6638038 },
  kg: { label: 'Kilogram', short: 'kg', grams: 1000 },
};

export const KARATS: { k: Karat; purity: number; note: string }[] = [
  { k: 24, purity: 1, note: 'Pure gold, bars & coins' },
  { k: 22, purity: 22 / 24, note: 'Coins & jewellery' },
  { k: 21, purity: 21 / 24, note: 'Popular jewellery' },
  { k: 18, purity: 18 / 24, note: 'Fine jewellery' },
  { k: 14, purity: 14 / 24, note: 'Everyday jewellery' },
];

export function purity(k: Karat): number {
  return KARATS.find((x) => x.k === k)?.purity ?? 1;
}

/** Convert USD per troy ounce (24K) into a price in `currency` per `unit` of `karat` gold. */
export function convert(usdPerOz: number, rate: number, unit: Unit, karat: Karat): number {
  return (usdPerOz * rate * UNITS[unit].grams * purity(karat)) / OZ_GRAMS;
}

/** Inverse of convert(): display price -> USD per ounce 24K */
export function toUsdOz(value: number, rate: number, unit: Unit, karat: Karat): number {
  return (value * OZ_GRAMS) / (rate * UNITS[unit].grams * purity(karat));
}

export const CURRENCIES: { code: string; name: string; flag: string }[] = [
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', flag: '🇬🇧' },
  { code: 'SAR', name: 'Saudi Riyal', flag: '🇸🇦' },
  { code: 'AED', name: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'KWD', name: 'Kuwaiti Dinar', flag: '🇰🇼' },
  { code: 'QAR', name: 'Qatari Riyal', flag: '🇶🇦' },
  { code: 'BHD', name: 'Bahraini Dinar', flag: '🇧🇭' },
  { code: 'OMR', name: 'Omani Rial', flag: '🇴🇲' },
  { code: 'JOD', name: 'Jordanian Dinar', flag: '🇯🇴' },
  { code: 'EGP', name: 'Egyptian Pound', flag: '🇪🇬' },
  { code: 'IQD', name: 'Iraqi Dinar', flag: '🇮🇶' },
  { code: 'TRY', name: 'Turkish Lira', flag: '🇹🇷' },
  { code: 'MAD', name: 'Moroccan Dirham', flag: '🇲🇦' },
  { code: 'DZD', name: 'Algerian Dinar', flag: '🇩🇿' },
  { code: 'TND', name: 'Tunisian Dinar', flag: '🇹🇳' },
  { code: 'INR', name: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'PKR', name: 'Pakistani Rupee', flag: '🇵🇰' },
  { code: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'JPY', name: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'CHF', name: 'Swiss Franc', flag: '🇨🇭' },
  { code: 'CAD', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'AUD', name: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'RUB', name: 'Russian Ruble', flag: '🇷🇺' },
  { code: 'MYR', name: 'Malaysian Ringgit', flag: '🇲🇾' },
  { code: 'IDR', name: 'Indonesian Rupiah', flag: '🇮🇩' },
  { code: 'ZAR', name: 'South African Rand', flag: '🇿🇦' },
];

/** Used only if every FX source is unreachable (pegged / approximate values). */
export const FALLBACK_RATES: Record<string, number> = {
  USD: 1, SAR: 3.75, AED: 3.6725, QAR: 3.64, BHD: 0.376, OMR: 0.3845, JOD: 0.709, KWD: 0.307,
  EUR: 0.9, GBP: 0.76,
};
