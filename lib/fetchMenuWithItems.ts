'use server'

import { cache } from 'react'
import { fetchMenuItemsWithModifiers, getCurrentMenu } from '@/lib/ssr-actions'
import { normalizeSquareItem } from '@/lib/utils'
import type { NormalizedItem } from '@/types'
import type { Schema } from '@/amplify/data/resource'

// Narrowed return type — remove lazy fields
export type EagerMenu = Omit<Schema['Menu']['type'], 'menuItems'> & {
  menuItems: {
    id: string
    catalogItemId: string
    sortOrder?: number
    isFeatured?: boolean
  }[]
}

export const fetchMenuWithItems = cache(
  async (locationId: string): Promise<{ menu: EagerMenu; items: NormalizedItem[] }> => {
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

    if (errors && errors.length > 0) {
      console.error('Error loading menuItems', errors)
      throw new Error('Failed to load menu items')
    }

    const squareIds = menuItems.map((item) => item.catalogItemId)

    console.time(L('square'))
    const rawItems = await fetchMenuItemsWithModifiers(squareIds)
    console.timeEnd(L('square'))

    //console.log('rawitems', rawItems, squareIds)

    const normalizedItems: NormalizedItem[] = menuItems
      .map((mi) => {
        const catalog = rawItems.find((ri) => ri.item.id === mi.catalogItemId)
        if (!catalog) return null

        const normalized = normalizeSquareItem(catalog)

        return {
          ...normalized,
          customName: mi.customName?.trim() || undefined,
          sortOrder: mi.sortOrder ?? 0,
          isFeatured: mi.isFeatured ?? false,
          menuItemId: mi.id,
          image: mi.s3ImageKey || normalized.image,
          catalogItemId: mi.catalogItemId,
        }
      })
      .filter(Boolean) as NormalizedItem[]

    const sanitizedMenu: EagerMenu = {
      ...menu,
      menuItems: menuItems.map((mi) => ({
        id: mi.id,
        catalogItemId: mi.catalogItemId,
        sortOrder: mi.sortOrder ?? undefined,
        isFeatured: mi.isFeatured ?? undefined,
      })),
    }
    console.timeEnd(L('menu'))

    return { menu: sanitizedMenu, items: normalizedItems }
  }
)
