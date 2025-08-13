// tests/unit/money.test.ts
import { describe, it, expect } from 'vitest'

// Adjust the import path to wherever you placed these helpers
import { calcItemSubtotalCents, calcCartSubtotalCents, calcTaxCents, calcTotalCents } from '@/lib/money'

// Minimal CartItem shape for the tests
type CartItem = {
  id: string
  name: string
  price: number // base price (cents)
  quantity: number
  toppings?: { name: string; price: number }[]
}

const mkItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 'id',
  name: 'Item',
  price: 0,
  quantity: 1,
  toppings: [],
  ...overrides,
})

describe('money helpers (all in cents)', () => {
  it('calcItemSubtotalCents: base + toppings, multiplied by quantity', () => {
    // $15.00 + $2.00 + $1.50 = $18.50, qty 2 => $37.00 (3700¢)
    const item = mkItem({
      price: 1500,
      toppings: [
        { name: 'pep', price: 200 },
        { name: 'cheese', price: 150 },
      ],
      quantity: 2,
    })
    expect(calcItemSubtotalCents(item as any)).toBe(3700)
  })

  it('calcItemSubtotalCents: handles no toppings safely', () => {
    const item = mkItem({ price: 999, quantity: 3, toppings: undefined })
    expect(calcItemSubtotalCents(item as any)).toBe(999 * 3)
  })

  it('calcCartSubtotalCents: sums multiple items', () => {
    const a = mkItem({ price: 1000, quantity: 1 }) // $10.00
    const b = mkItem({ price: 500, quantity: 2, toppings: [{ name: 'x', price: 50 }] }) // ($5.00+$0.50)*2 = $11.00
    expect(calcCartSubtotalCents([a as any, b as any])).toBe(1000 + 1100) // 2100¢
  })

  it('calcTaxCents: rounds to whole cents once (e.g., 8.75%)', () => {
    // Subtotal $18.50 → 1850¢; 1850 * 0.0875 = 161.875 → rounds to 162¢ ($1.62)
    const subtotal = 1850
    const taxRate = 0.0875
    expect(calcTaxCents(subtotal, taxRate)).toBe(162)
  })

  it('calcTotalCents: subtotal + rounded tax', () => {
    // Using the same example: 1850 + 162 = 2012¢ ($20.12)
    // (Change the expected if your cart intentionally taxes per-line instead of on subtotal)
    const subtotal = 1850
    const taxRate = 0.0875
    expect(calcTotalCents(subtotal, taxRate)).toBe(1850 + 162)
  })

  it('calcTaxCents: tiny values don’t invent pennies', () => {
    // 1¢ subtotal at 0.5% tax → 0.005¢ → rounds to 0¢
    expect(calcTaxCents(1, 0.005)).toBe(0)
  })

  it('end-to-end math: classic Margherita + two mods matches $18.50 pre-tax', () => {
    const margherita = mkItem({
      price: 1500, // $15.00
      toppings: [
        { name: 'pep', price: 200 },
        { name: 'cheese', price: 150 },
      ],
      quantity: 1,
    })
    expect(calcItemSubtotalCents(margherita as any)).toBe(1850)
    expect(calcCartSubtotalCents([margherita as any])).toBe(1850)
  })
})
