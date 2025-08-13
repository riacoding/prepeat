import { CartItem } from '@/types'

export const calcItemSubtotalCents = (item: CartItem) => {
  const toppingsTotal = (item.toppings ?? []).reduce((sum, t) => sum + (t.price ?? 0), 0)
  return (item.price + toppingsTotal) * item.quantity // all in cents
}

export const calcCartSubtotalCents = (items: CartItem[]) =>
  items.reduce((sum, it) => sum + calcItemSubtotalCents(it), 0)

export const calcTaxCents = (subtotalCents: number, taxRate: number) => Math.round(subtotalCents * taxRate) // e.g. 0.0875 for 8.75%

export const calcTotalCents = (subtotalCents: number, taxRate: number) =>
  subtotalCents + calcTaxCents(subtotalCents, taxRate)
