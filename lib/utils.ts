import { NormalizedItem, ReceiptItem, SquareItem, SquareModifierList } from '@/types'
import { clsx, type ClassValue } from 'clsx'
import { format } from 'date-fns'
import { createHash } from 'crypto'
import { twMerge } from 'tailwind-merge'

const locationId = process.env.NEXT_PUBLIC_LOCATION_ID

export function md5Hex(s: string) {
  return createHash('md5').update(s, 'utf8').digest('hex')
}

export function isEmail(s: string) {
  // light server-side sanity check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateOnly(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day) // constructs in local time, no shift
  return format(date, 'MMMM d, yyyy')
}

//TODO: normalize the names with the menu names otherwise it will be base name
export function extractReceiptItems(order: any, nameOverrides: Record<string, string>): ReceiptItem[] {
  if (!order.lineItems || !Array.isArray(order.lineItems)) return []

  return order.lineItems.map((item: any): ReceiptItem => {
    const quantity = parseInt(item.quantity || '1', 10)
    const overrideName = item.catalogObjectId ? nameOverrides[item.catalogObjectId] : undefined

    return {
      name: overrideName || item.name,
      quantity,
      basePrice: Number(item.basePriceMoney?.amount ?? 0),
      totalPrice: Number(item.totalMoney?.amount ?? 0),
      modifiers: (item.modifiers || []).map((mod: any) => ({
        name: mod.name,
        quantity: parseInt(mod.quantity || '1', 10),
        price: Number(mod.totalPriceMoney?.amount ?? 0),
      })),
    }
  })
}

export function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // Some environments throw here even if the function exists
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export const orderNumberToTicket = (orderNumber: string) => {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const ticket = `${locationId}-${dateStr}-${orderNumber}` // e.g., 20250505-003
  console.log('ticket', ticket)
  return ticket
}

export function normalizeSquareItem({
  item,
  modifierLists,
}: {
  item: SquareItem
  modifierLists: SquareModifierList[]
}): NormalizedItem {
  return {
    id: item.id,
    name: item.item_data.name,
    description: item.item_data.description,
    price: item.item_data.variations?.[0]?.item_variation_data?.price_money?.amount ?? 0,
    image: item.item_data.image_url ?? '/placeholder.svg',
    catalogItemId: item.id,
    catalogVariationId: item.item_data.variations?.[0]?.id ?? '0',
    sortOrder: 0,
    isFeatured: false,
    menuItemId: '0',
    customName: undefined,
    toppings: modifierLists.flatMap(
      (group) =>
        group.modifier_list_data?.modifiers?.map((mod) => ({
          id: mod.id,
          name: mod.modifier_data.name,
          price: mod.modifier_data.price_money?.amount ?? 0,
          groupName: group.modifier_list_data?.name ?? 'Modifiers',
          isDefault: mod.modifier_data.on_by_default ?? false,
          isLocked: false,
        })) ?? []
    ),
  }
}
