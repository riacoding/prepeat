'use server'

import { cache } from 'react'
import { fetchMenuItemsWithModifiers, getCurrentMenu } from '@/lib/ssr-actions'
import { isModifierObject, type NormalizedItem, type VariationWithModifiers } from '@/types'
import type { Schema } from '@/amplify/data/resource'
import { sanitizeBigInts } from '@/amplify/functions/webhookProcessor/util'

// Narrowed return type — remove lazy fields
export type EagerMenu = Omit<Schema['Menu']['type'], 'menuItems'> & {
  menuItems: {
    id: string
    catalogItemId: string
    sortOrder?: number
    isFeatured?: boolean
  }[]
}

export async function normalizeSquareItem({ item, modifierLists }: VariationWithModifiers): Promise<NormalizedItem> {
  return {
    id: item.catalogVariationId,
    name: item.itemName ?? '',
    description: item.itemDescription ?? '',
    price: item.priceCents ?? 0,
    image: item.s3ItemKey ?? '/placeholder.svg',
    catalogItemId: item.parentItemId,
    catalogVariationId: item.catalogVariationId,
    sortOrder: 0,
    isFeatured: false,
    menuItemId: '0',
    customName: undefined,
    modifiers: modifierLists.flatMap(
      (group) =>
        group.modifierListData?.modifiers?.filter(isModifierObject).map((mod) => ({
          id: mod.id,
          name: mod.modifierData.name ?? '',
          price: sanitizeBigInts(mod.modifierData.priceMoney?.amount) ?? 0,
          groupName: group.modifierListData?.name ?? 'Modifiers',
        })) ?? []
    ),
  }
}

const notNull = <T>(x: T | null | undefined): x is T => x != null

export const fetchMenuWithItems = cache(
  async (merchantId: string, locationId: string): Promise<{ menu: EagerMenu; items: NormalizedItem[] }> => {
    const run = Math.random().toString(36).slice(2, 7)
    const L = (s: string) => `${s}:${locationId}#${run}`
    console.log(`[FETCH MENU] Fetching fresh data for: ${locationId}`)

    console.time(L('menu'))
    console.time(L('getCurrent'))
    const menu = await getCurrentMenu(locationId)
    if (!menu) throw new Error('No active menu for this location')
    console.timeEnd(L('getCurrent'))

    console.time(L('itemsQuery'))
    const { data: menuItems, errors } = await menu.menuItems()
    console.timeEnd(L('itemsQuery'))

    if (errors?.length) {
      console.error('Error loading menuItems', errors)
      throw new Error('Failed to load menu items')
    }

    // Collect both ITEM and VARIATION ids in case your fetcher needs either.
    const itemIds = menuItems.map((mi) => mi.catalogItemId).filter(Boolean) as string[]
    const variationIds = menuItems.map((mi) => mi.catalogVariationId).filter(Boolean) as string[]

    console.time(L('square'))
    const rawItems = await fetchMenuItemsWithModifiers(merchantId, variationIds)
    console.timeEnd(L('square'))

    const byVarId = new Map<string, (typeof rawItems)[number]>()
    for (const r of rawItems) {
      if (r.item.catalogVariationId) byVarId.set(r.item.catalogVariationId, r)
    }

    // Normalize in parallel
    const normalizedItems = (
      await Promise.all(
        menuItems.map(async (mi) => {
          const catalog = byVarId.get(mi.catalogVariationId)
          if (!catalog) return null

          const normalized = await normalizeSquareItem(catalog) // <-- now valid

          return {
            ...normalized,
            customName: mi.customName?.trim() || undefined,
            sortOrder: mi.sortOrder ?? 0,
            isFeatured: mi.isFeatured ?? false,
            menuItemId: mi.id,
            image: mi.s3ImageKey || normalized.image,
            catalogItemId: mi.catalogItemId,
          } as NormalizedItem
        })
      )
    ).filter(notNull)

    const sanitizedMenu: EagerMenu = {
      ...menu,
      menuItems: menuItems.map((mi) => ({
        id: mi.id,
        catalogItemId: mi.catalogVariationId,
        sortOrder: mi.sortOrder ?? undefined,
        isFeatured: mi.isFeatured ?? undefined,
      })),
    }

    console.timeEnd(L('menu'))
    return { menu: sanitizedMenu, items: normalizedItems }
  }
)
