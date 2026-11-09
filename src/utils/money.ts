/**
 * src/utils/money.ts
 * Iraqi Dinar (IQD) money helpers.
 *
 * The smallest practical cash unit in Iraq is 250 IQD, so all computed bills
 * are rounded to the nearest 250 IQD to avoid fractional dinar amounts.
 */

export function roundIQD(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount / 250) * 250;
}

export function formatIQD(amount: number, currency: string = 'د.ع'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toLocaleString('ar-IQ')} ${currency}`;
}

/** Clamp ampere values to a sane, positive range (0.5A .. 1000A). */
export function normalizeAmperes(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(1000, Math.max(0.5, Math.round(value * 2) / 2));
}

export function normalizeMoney(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return roundIQD(value);
}
