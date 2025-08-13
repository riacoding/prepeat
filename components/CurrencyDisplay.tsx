import { formatCurrencyCents } from '@/lib/moneyFormat'
import React from 'react'

type Props = {
  /** Amount in cents (e.g., 1850 -> $18.50) */
  value?: number | null
  locale?: string
  currency?: string
}

function CurrencyDisplay({ value, locale = 'en-US', currency = 'USD' }: Props) {
  if (value === null || value === undefined) return null

  const formatted = formatCurrencyCents(value, locale, currency)
  return <span>{formatted}</span>
}

export default CurrencyDisplay
