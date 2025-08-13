// moneyFormat.ts
export function formatCurrencyCents(cents: number, locale = 'en-US', currency = 'USD') {
  if (!Number.isFinite(cents)) throw new Error('Invalid cents')
  return (cents / 100).toLocaleString(locale, { style: 'currency', currency })
}
