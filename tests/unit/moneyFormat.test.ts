import { describe, it, expect } from 'vitest'
import { formatCurrencyCents } from '@/lib/moneyFormat'

describe('formatCurrencyCents', () => {
  it('formats positive amounts', () => {
    expect(formatCurrencyCents(1850)).toBe('$18.50')
  })
  it('formats zero', () => {
    expect(formatCurrencyCents(0)).toBe('$0.00')
  })
  it('formats negative amounts', () => {
    expect(formatCurrencyCents(-123)).toBe('-$1.23')
  })
})
