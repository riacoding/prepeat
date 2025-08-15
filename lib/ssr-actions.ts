/**
 * Menu Actions – SSR + Square Catalog Fetching
 *
 * This module handles:
 * - Fetching menus from Amplify (CRUD, current menu lookup)
 * - Interfacing with Square’s Catalog API to fetch items and modifiers
 * - Normalizing Square data for frontend usage
 *
 * Key Functions:
 *
 * • `fetchMenus()` – List all Amplify menus (userPool auth)
 * • `fetchMenuById(id)` – Fetch a single menu from Amplify
 * • `getCurrentMenu(locationId)` – Get the active menu for a specific location
 *
 * • `getSquareItems(ids)` – Fetch basic item info from Square using `catalog/list`
 * • `getSquareItemDetail(id)` – Fetch a single item (with variation + modifier IDs)
 *
 * • `getSquareItemsWithModifiers(ids)` –
 *    Fetch Square items with full modifier list content.
 *    Resolves all modifier list IDs and merges them per item.
 *
 * • `saveMenu(input)` – Create or update an Amplify menu
 *
 * Types:
 * - `SquareItem`, `SquareModifierList`, `SquareCatalogObject` – modeled after Square's catalog schema
 * - `ItemWithModifiers` – combined Square item + its modifier lists for normalization
 */

'use server'
import { secret } from '@aws-amplify/backend'
import { getCurrentUser } from '@aws-amplify/auth'
import { cookieBasedClient, getCurrentUserServer } from '@/util/amplify'
import { Schema } from '@/amplify/data/resource'
import {
  Menu,
  SquareItem,
  SquareModifierList,
  SquareCatalogObject,
  menuSelectionSet,
  HydratedCatalog,
  MenuInput,
  CatalogItem,
  CreateMenuItemInput,
  menuItemSelectionSet,
  catalogItemSelectionSet,
  RemoveFunctions,
  SafeMenuItem,
  ReceiptItem,
  FulfillmentState,
  SquareOrder,
  SecureReceipt,
  SquareAuthResponse,
  Merchant,
  UpdateMerchantInput,
  UpdateMenuInput,
  merchantSelectionSet,
  MerchantSelected,
  PublicMerchant,
  OrderReceipt,
  DemoOrderInput,
} from '@/types'
import { extractReceiptItems, orderNumberToTicket } from './utils'
import { SquareClient, SquareEnvironment } from 'square'
import { randomUUID } from 'crypto'
import { sanitizeBigInts } from '@/amplify/functions/webhookProcessor/util'
import { mockSquareOrderFromCart } from './mockSquareOrderFromCart'
import { aws_fis } from 'aws-cdk-lib'

const SQUARE_BASE_URL = 'https://connect.squareupsandbox.com/v2'
const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN

const client = new SquareClient({
  environment: SquareEnvironment.Sandbox,
  token: SQUARE_TOKEN,
})

export const isAuth = async () => {
  const auth = await getCurrentUserServer()

  if (auth.user) {
    return true
  }
  return false
}

export async function getSquareClient(
  accessToken: string,
  environment: SquareEnvironment = SquareEnvironment.Sandbox
): Promise<SquareClient | null> {
  if (!accessToken) return null
  return new SquareClient({
    token: accessToken,
    environment,
  })
}

export const fetchMenus = async (merchantId: string) => {
  const authMode = (await isAuth()) ? 'userPool' : 'iam'
  console.log('fetch Menu', merchantId)

  try {
    const { data, errors } = await cookieBasedClient.models.Menu.listMenuByMerchantId(
      { merchantId },
      {
        selectionSet: [...menuSelectionSet],
        authMode,
      }
    )

    if (errors && errors.length > 0) {
      console.error('Error fetching menus:', errors)
      throw new Error(errors.map((e) => e.message).join(', '))
    }

    return data
  } catch (err) {
    console.log(err)
    return []
  }
}

export const fetchMenuById = async (id: string) => {
  const authMode = (await isAuth()) ? 'userPool' : 'iam'
  const { data, errors } = await cookieBasedClient.models.Menu.get({ id }, { selectionSet: menuSelectionSet, authMode })
  if (errors && errors.length > 0) {
    console.error('Error fetching menu:', errors)
    throw new Error(errors.map((e) => e.message).join(', '))
  }
  console.log('fetchMenu', data)
  return data
}

export const fetchCurrentMenus = async () => {
  const authMode = (await isAuth()) ? 'userPool' : 'iam'
  try {
    const { data, errors } = await cookieBasedClient.models.Menu.list({
      filter: { isActive: { eq: true } },
      authMode,
    })
    if (errors && errors.length > 0) {
      console.error('Error fetching menus:', errors)
      throw new Error(errors.map((e) => e.message).join(', '))
    }
    return data
  } catch (err) {
    console.log(err)
  }
}

export const getCurrentMenu = async (locationId: string): Promise<Menu | null> => {
  const authMode = (await isAuth()) ? 'userPool' : 'identityPool'
  //console.log('locationId', locationId)
  const { data, errors } = await cookieBasedClient.models.Menu.list({
    filter: { locationId: { eq: locationId }, isActive: { eq: true } },
    authMode,
  })
  if (errors && errors.length > 0) {
    console.error('Error fetching menu:', errors)
    throw new Error(errors.map((e) => e.message).join(', '))
  }
  console.log('current menu', data)
  return data[0]
}

export async function updateSquareOrder(
  referenceId: string,
  locationId: string,
  newState: FulfillmentState,
  merchantId: string
) {
  console.log(`Updating order ${referenceId} at Location:${locationId} to ${newState.state}`)
  const authMode = (await isAuth()) ? 'userPool' : 'identityPool'

  // 🛑 Detect and handle demo orders
  if (referenceId.startsWith('demo-')) {
    console.log(`[updateSquareOrder] Skipping Square update — demo order ${referenceId}`)

    // Fetch the Amplify order by ID
    const amplifyOrder = await getAmplifyDemoOrderById(referenceId)

    if (!amplifyOrder?.rawData) {
      console.warn(`[updateSquareOrder] Demo order ${referenceId} missing rawData`)
      return
    }

    // Parse rawData if stored as a string (DynamoDB edge case)
    const rawData: SquareOrder =
      typeof amplifyOrder.rawData === 'string' ? JSON.parse(amplifyOrder.rawData) : amplifyOrder.rawData

    // Safely clone and update fulfillments in Order rawData
    const updatedRawData: SquareOrder = {
      ...rawData,
      fulfillments: (rawData.fulfillments || []).map((f) => ({
        ...f,
        state: newState.state,
      })),
    }

    // Write it back into Amplify
    await updateAmplifyDemoOrder(updatedRawData, newState)

    // Check if check phone exists for demo order and notify
    const { data: phones, errors: phoneErrors } = await cookieBasedClient.models.Phone.listPhoneByReferenceId(
      { referenceId: referenceId },
      { authMode }
    )

    if (phoneErrors?.length) {
      console.error('Amplify fetch phone errors:', phoneErrors)
      return
    }

    if (!phones?.length) {
      console.warn(`No matching phone record found for demo order ${referenceId}`)
      return
    }

    await cookieBasedClient.mutations.demoNotifyPhone({ phone: phones[0].phone, referenceId })

    return
  }

  const merchant = await getServerMerchant(merchantId)
  if (!merchant) return
  const client = await getSquareClient(merchant.accessToken)
  if (!client) return

  try {
    // Step 1: Fetch existing order
    const { order } = await client.orders.get({ orderId: referenceId })

    if (!order || !order.fulfillments || order.fulfillments.length !== 1) {
      throw new Error(`Unexpected fulfillment state: ${JSON.stringify(order?.fulfillments)}`)
    }

    const fulfillment = order.fulfillments[0]

    // Step 2: Update the state
    fulfillment.state = newState.state

    // Step 3: Send the full fulfillment object back in the update
    const { order: newOrder } = await client.orders.update({
      orderId: referenceId,
      idempotencyKey: randomUUID(),
      order: {
        version: order.version!,
        locationId,
        fulfillments: [fulfillment],
      },
    })

    console.log(`Square Order ${referenceId} successfully updated.`)
    if (!newOrder?.id) {
      throw new Error('Updated Square order has no ID')
    }

    await updateAmplifyOrder(newOrder as SquareOrder, newState)
  } catch (err) {
    console.error('Failed to update Square order:', err)
  }
}

export async function updateOrderContact(phone: string, referenceId: string, isDemo: boolean = false): Promise<void> {
  console.log(`Updating phone ${phone} for ticket ${referenceId}`)
  const authMode = (await isAuth()) ? 'userPool' : 'iam'

  const { data: phones, errors: phoneErrors } = await cookieBasedClient.models.Phone.listPhoneByReferenceId(
    { referenceId: referenceId },
    { authMode }
  )

  if (phoneErrors?.length) {
    console.error('Amplify fetch phone errors:', phoneErrors)
    return
  }

  if (!phones?.length) {
    console.warn('No matching phone record found')
    const { data: newPhone, errors: newPhoneErrors } = await cookieBasedClient.models.Phone.create(
      {
        phone,
        referenceId: referenceId,
        clientUpdated: true,
        optIn: true,
        isDemoOrder: isDemo,
      },
      { authMode }
    )

    if (newPhone) {
      console.log(`📲 New phone ${newPhone.id} created for ticket ${referenceId}`)
    }

    if (newPhoneErrors?.length) {
      console.error('Amplify create phone errors:', newPhoneErrors)
    }

    return
  }

  const existing = phones[0]

  // 🛡️ Avoid redundant update
  if (existing.optIn && existing.clientUpdated && existing.phone === phone) {
    console.log(`Phone already opted in and matches — skipping update`)
    return
  }

  const { data: orderPhone, errors } = await cookieBasedClient.models.Phone.update(
    {
      id: existing.id,
      phone,
      referenceId: referenceId,
      clientUpdated: true,
      optIn: true,
    },
    { authMode }
  )

  if (errors?.length) {
    console.error('Amplify update errors:', errors)
  } else {
    console.log(`📲 Phone ${orderPhone?.id} marked as clientUpdated + opted in`)
  }
}

export async function updateAmplifyDemoOrder(order: SquareOrder, newState: FulfillmentState): Promise<void> {
  const authMode = (await isAuth()) ? 'userPool' : 'identityPool'
  try {
    const { data, errors } = await cookieBasedClient.models.DemoOrder.update(
      {
        id: order.id,
        fulfillmentStatus: newState.state,
        rawData: JSON.stringify(sanitizeBigInts(order)),
      },
      { authMode }
    )

    if (errors) {
      console.error('Amplify update errors:', errors)
    } else {
      console.log(`Amplify order ${order.id} updated to ${newState.state}`)
    }
  } catch (err) {
    console.log(err)
  }
}

export async function updateAmplifyOrder(order: SquareOrder, newState: FulfillmentState): Promise<void> {
  try {
    const { data, errors } = await cookieBasedClient.models.Order.update({
      id: order.id,
      fulfillmentStatus: newState.state,
      rawData: JSON.stringify(sanitizeBigInts(order)),
    })

    if (errors) {
      console.error('Amplify update errors:', errors)
    } else {
      console.log(`Amplify order ${order.id} updated to ${newState.state}`)
    }
  } catch (err) {
    console.log(err)
  }
}

export async function getSquareItemDetail(itemId: string) {
  const token = process.env.SQUARE_ACCESS_TOKEN

  const res = await fetch(`https://connect.squareupsandbox.com/v2/catalog/object/${itemId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  if (!res.ok) return null

  const json = await res.json()
  const object = json.object

  if (!object || object.type !== 'ITEM') return null

  const variation = object.item_data.variations?.[0]
  const price = variation?.item_variation_data?.price_money?.amount ?? 0

  return {
    id: object.id,
    name: object.item_data.name,
    description: object.item_data.description,
    price: price / 100,
    modifiers: object.item_data.modifier_list_info ?? [],
  }
}

export async function getSquareItems(ids: string[]): Promise<SquareItem[]> {
  const token = process.env.SQUARE_ACCESS_TOKEN || 'noToken'

  const res = await fetch('https://connect.squareupsandbox.com/v2/catalog/list', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  const json = await res.json()
  const objects = json.objects || []

  return objects
    .filter((obj: any) => ids.includes(obj.id))
    .map((item: any) => ({
      id: item.id,
      name: item.item_data?.name,
      description: item.item_data?.description,
      price: item.item_data?.variations?.[0]?.item_variation_data?.price_money?.amount / 100 || 0,
      image: '/placeholder.svg', // You could later use Square image links
    }))
}

export async function getSquareOrderByOrderNumber(
  orderNumber: string,
  orderToken: string,
  isDemo?: boolean
): Promise<OrderReceipt | null> {
  const token = process.env.SQUARE_ACCESS_TOKEN || 'noToken'
  const locationId = process.env.SQUARE_LOCATION_ID || 'noLocation'

  const referenceId = orderNumber

  const authMode = (await isAuth()) ? 'userPool' : 'identityPool'

  try {
    console.log('fetching order:', referenceId, isDemo, authMode)
    const { data, errors } = isDemo
      ? await cookieBasedClient.models.DemoOrder.listDemoOrderByReferenceId({ referenceId: referenceId }, { authMode })
      : await cookieBasedClient.models.Order.listOrderByReferenceId({ referenceId: referenceId }, { authMode })

    if (errors && errors?.length > 0) {
      console.error('Error fetching order:', errors)
      throw new Error(errors.map((e) => e.message).join(', '))
    }
    const orderId = data[0].id
    const raw = data[0]?.rawData

    if (!raw) {
      console.error('❌ rawData is missing or not a string')
      return null
    }

    const order: SquareOrder = typeof raw === 'string' ? JSON.parse(raw) : ''

    const menuSlug = order?.metadata?.menuSlug
    const squareOrderToken = order?.metadata?.orderToken
    const menu = menuSlug ? await getCurrentMenu(menuSlug) : null
    if (menu) {
      const { data: menuItems } = await menu.menuItems()

      const nameOverrides: Record<string, string> = {}
      for (const item of menuItems) {
        if (item.catalogItemId && item.customName) {
          nameOverrides[item.catalogItemId] = item.customName
        }
      }
      console.log('name overrides', nameOverrides)
      const receiptItems = extractReceiptItems(order, nameOverrides)
      if (squareOrderToken === orderToken) {
        return { id: orderId, receiptItems }
      }
      return null
    }

    return null
  } catch (err) {
    console.error(`Error fetching order ${orderNumber} referenceId: ${referenceId}`, err)
    return null
  }

  // const res = await fetch('https://connect.squareupsandbox.com/v2/orders/search', {
  //   method: 'POST',
  //   headers: {
  //     Authorization: `Bearer ${token}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     location_ids: [locationId],
  //     query: {
  //       filter: {
  //         reference_id: {
  //           exact: referenceId,
  //         },
  //       },
  //     },
  //   }),
  //   cache: 'no-store',
  // })

  // const json = await res.json()
  // return json.orders?.[0] || null
}

export async function saveMenu(input: MenuInput): Promise<{ id: string | null }> {
  const { id, ...rest } = input

  const cleanData = {
    ...rest,
    locationId: rest.locationId.toLowerCase(),
    theme: rest.theme,
  }

  const op = id
    ? cookieBasedClient.models.Menu.update({ id, ...cleanData }, { authMode: 'userPool' })
    : cookieBasedClient.models.Menu.create(cleanData, { authMode: 'userPool' })

  const { data, errors } = await op

  if (errors && errors.length > 0) {
    console.error(`Error ${id ? 'updating' : 'creating'} menu:`, errors)
    throw new Error(errors.map((e) => e.message).join(', '))
  }

  return { id: data?.id ?? null }
}

export async function saveMenuItemsForMenu(menuId: string, selectedCatalogItemIds: string[], merchantId: string) {
  const { data: existingItems, errors } = await cookieBasedClient.models.MenuItem.list({
    filter: { menuId: { eq: menuId } },
    authMode: 'userPool',
  })

  if (errors && errors.length > 0) {
    console.error('Error fetching existing MenuItems:', errors)
    throw new Error(errors.map((e) => e.message).join(', '))
  }

  const existing = existingItems ?? []

  const existingCatalogIds = new Set(existing.map((mi) => mi.catalogItemId))
  const selectedCatalogIds = new Set(selectedCatalogItemIds)

  const toDelete = existing.filter((mi) => !selectedCatalogIds.has(mi.catalogItemId))
  const toCreate = Array.from(selectedCatalogIds).filter((id) => !existingCatalogIds.has(id))

  // Delete items not in new selection
  await Promise.all(
    toDelete.map((mi) => cookieBasedClient.models.MenuItem.delete({ id: mi.id }, { authMode: 'userPool' }))
  )

  // Create new items not already existing
  await Promise.all(
    toCreate.map((catalogItemId, index) =>
      cookieBasedClient.models.MenuItem.create(
        {
          menuId,
          merchantId,
          catalogItemId,
          isFeatured: false,
          sortOrder: index,
        },
        { authMode: 'userPool' }
      )
    )
  )
}

export async function deleteMenuItem(id: string) {
  const { data, errors } = await cookieBasedClient.models.MenuItem.delete({ id }, { authMode: 'userPool' })
  if (errors && errors.length > 0) {
    console.error('Error deleting menu:', errors)
    throw new Error(errors.map((e) => e.message).join(', '))
  }
  return data?.id
}

export async function createMenuItem(input: CreateMenuItemInput): Promise<SafeMenuItem> {
  const { data, errors } = await cookieBasedClient.models.MenuItem.create(
    {
      menuId: input.menuId,
      merchantId: input.merchantId,
      catalogItemId: input.catalogItemId,
      isFeatured: input.isFeatured ?? false,
      sortOrder: input.sortOrder ?? 0,
    },
    { authMode: 'userPool' }
  )

  if (errors && errors.length > 0) {
    console.error('Error creating MenuItem:', errors)
    throw new Error(errors.map((e) => e.message).join(', '))
  }

  return {
    id: data!.id,
    menuId: data!.menuId,
    merchantId: data!.merchantId,
    catalogItemId: data!.catalogItemId,
    s3ImageKey: data!.s3ImageKey,
    customName: data!.customName,
    isFeatured: data!.isFeatured,
    sortOrder: data!.sortOrder,
    createdAt: data!.createdAt,
    updatedAt: data!.updatedAt,
    owner: data!.owner,
  }
}

export async function deleteMenuItemsForMenu(menuId: string): Promise<void> {
  const { data, errors } = await cookieBasedClient.models.MenuItem.list({
    filter: { menuId: { eq: menuId } },
    authMode: 'userPool',
  })

  if (errors && errors.length > 0) {
    console.error('Error fetching MenuItems to delete:', errors)
    throw new Error(errors.map((e) => e.message).join(', '))
  }

  if (!data?.length) return

  await Promise.all(
    data.map((item) => cookieBasedClient.models.MenuItem.delete({ id: item.id }, { authMode: 'userPool' }))
  )
}

type ItemWithModifiers = {
  item: SquareItem
  modifierLists: SquareModifierList[]
}

export async function getCatalogItems(merchantId: string): Promise<HydratedCatalog[] | []> {
  const authMode = (await isAuth()) ? 'userPool' : 'iam'
  try {
    const { data, errors } = await cookieBasedClient.models.CatalogItem.listCatalogItemByMerchantId(
      { merchantId },
      {
        authMode,
      }
    )
    if (errors && errors.length > 0) {
      console.error('Error fetching menus:', errors)
      throw new Error(errors.map((e) => e.message).join(', '))
    }

    const hydrated = data.map((item) =>
      typeof item.catalogData === 'string' ? (JSON.parse(item.catalogData) as HydratedCatalog) : null
    )

    return hydrated.filter((item) => item !== null)
  } catch (err) {
    console.log(err)
    return []
  }
}

export async function getAllSquareCatalogItems(): Promise<SquareCatalogObject[]> {
  try {
    const res = await fetch(`${SQUARE_BASE_URL}/catalog/list`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${SQUARE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    const json = await res.json()
    const objects: SquareCatalogObject[] = json.objects || []

    console.log(
      'fetch getAllSquareCatalogItems',
      typeof SQUARE_TOKEN === 'string' ? SQUARE_TOKEN.substring(0, 5) : '(no token)',
      JSON.stringify(objects, null, 2)
    )
    return objects.filter((obj) => obj.type === 'ITEM')
  } catch (err) {
    console.log(err)
    return []
  }
}

//fetch from appsync
export async function fetchMenuItemsWithModifiers(squareItemIds: string[]): Promise<ItemWithModifiers[]> {
  const authMode = (await isAuth()) ? 'userPool' : 'identityPool'
  const { data, errors } = await cookieBasedClient.models.CatalogItem.list({
    authMode,
  })

  if (errors && errors.length > 0) {
    console.error('Error fetching CatalogItems:', errors)
    return []
  }
  //console.log('fetchMenuItemsWithModifiers', data)
  const allItems = data ?? []

  const filtered = allItems.filter((item) => squareItemIds.includes(item.squareItemId))

  //console.log('Filtered', filtered)

  // Hydrate and return in expected format
  const hydrated: ItemWithModifiers[] = filtered.map((ci) => {
    const parsed = JSON.parse(ci.catalogData as unknown as string) as {
      item: SquareItem
      modifierLists?: SquareModifierList[]
    }
    const { item, modifierLists } = parsed as {
      item: SquareItem
      modifierLists?: SquareModifierList[]
    }
    //console.log('appsync item', item)
    return {
      item,
      modifierLists: modifierLists ?? [],
    }
  })
  return hydrated
}

export async function getMenuItemWithCatalogItem(id: string) {
  const { data: menuItem, errors } = await cookieBasedClient.models.MenuItem.get(
    { id },
    { selectionSet: menuItemSelectionSet, authMode: 'userPool' }
  )

  if (errors?.length || !menuItem) return null

  const { data: catalogItem } = await cookieBasedClient.models.CatalogItem.get(
    { merchantId: menuItem.merchantId, squareItemId: menuItem.catalogItemId },
    { selectionSet: catalogItemSelectionSet, authMode: 'userPool' }
  )

  const hydrated = {
    ...catalogItem,
    catalogData:
      typeof catalogItem?.catalogData === 'string' ? JSON.parse(catalogItem.catalogData) : catalogItem?.catalogData,
  }

  return {
    ...menuItem,
    ...hydrated, // for fallback name/image
    id: menuItem.id,
  }
}

export async function updateMenuItem(input: {
  id: string
  customName?: string
  sortOrder?: number
  isFeatured?: boolean
  s3ImageKey?: string
}) {
  console.log('MenuItem update:', input)
  const { id, ...fields } = input
  const { data, errors } = await cookieBasedClient.models.MenuItem.update({ id, ...fields }, { authMode: 'userPool' })

  if (errors?.length) {
    console.error('Update failed:', errors)
    throw new Error(errors.map((e) => e.message).join(', '))
  }

  return data?.id
}

export async function getSquareItemsWithModifiers(merchant: Merchant): Promise<ItemWithModifiers[] | []> {
  const token = merchant.accessToken
  if (!token) throw new Error('No access token')

  try {
    const res = await fetch(`${SQUARE_BASE_URL}/catalog/list`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    const json = await res.json()
    const objects: SquareCatalogObject[] = json.objects || []

    console.log('objects', objects)

    // 1. Filter to only requested items
    const items: SquareItem[] = objects.filter((obj): obj is SquareItem => obj.type === 'ITEM')

    // 2. Collect modifier list IDs from both item and variation levels
    const modifierListIds = new Set<string>()

    for (const item of items) {
      // item-level
      const itemLevel = item.item_data?.modifier_list_info ?? []
      itemLevel.forEach((info) => {
        if (info.enabled && info.modifier_list_id) {
          modifierListIds.add(info.modifier_list_id)
        }
      })

      // variation-level
      const variations = item.item_data?.variations ?? []
      for (const variation of variations) {
        const varInfos = variation.item_variation_data?.modifier_list_info ?? []
        varInfos.forEach((info) => {
          if (info.enabled && info.modifier_list_id) {
            modifierListIds.add(info.modifier_list_id)
          }
        })
      }
    }

    // 3. Fetch all modifier lists
    const modifierLists: Record<string, SquareModifierList> = {}

    await Promise.all(
      Array.from(modifierListIds).map(async (id) => {
        const res = await fetch(`${SQUARE_BASE_URL}/catalog/object/${id}`, {
          headers: {
            Authorization: `Bearer ${SQUARE_TOKEN}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        })

        const json = await res.json()
        modifierLists[id] = json.object
      })
    )

    // 4. Return items with resolved modifier lists
    return items.map((item) => {
      const listIds = new Set<string>()

      const itemLevel = item.item_data?.modifier_list_info ?? []
      itemLevel.forEach((info) => {
        if (info.enabled && info.modifier_list_id) {
          listIds.add(info.modifier_list_id)
        }
      })

      const variations = item.item_data?.variations ?? []
      for (const variation of variations) {
        const varInfos = variation.item_variation_data?.modifier_list_info ?? []
        varInfos.forEach((info) => {
          if (info.enabled && info.modifier_list_id) {
            listIds.add(info.modifier_list_id)
          }
        })
      }

      const resolvedLists = Array.from(listIds)
        .map((id) => modifierLists[id])
        .filter((list): list is SquareModifierList => Boolean(list))

      return {
        item,
        modifierLists: resolvedLists,
      }
    })
  } catch (err) {
    console.log(err)
  }

  return []
}

export async function syncMenuItems(merchant: PublicMerchant) {
  const serverMerchant = await getServerMerchant(merchant.id)
  if (!serverMerchant) return
  const itemsWithModifiers = await getSquareItemsWithModifiers(serverMerchant)

  console.log('items to sync', itemsWithModifiers)

  for (const { item, modifierLists } of itemsWithModifiers) {
    const catalogData = {
      item,
      modifierLists,
    }

    const variation = item.item_data.variations?.find((v) => v.item_variation_data?.name === 'Regular')

    const catalogVariationId = variation?.id!

    console.log('variation', catalogVariationId, variation)

    // Save into local DynamoDB catalog
    const catalogItem = await upsertCatalogItem({
      squareItemId: item.id,
      merchantId: merchant.id,
      catalogVariationId,
      catalogData,
    })

    //  // Step 2: Save into MenuItem
    //  await upsertMenuItem({
    //   menuId,
    //   catalogItemId: catalogItem.id,
    //   customName: item.itemData?.name ?? '',
    // })
  }
}

export async function setupWebhooks() {}

export async function createDefaultMenu() {}

export async function upsertCatalogItem({
  squareItemId,
  merchantId,
  catalogVariationId,
  catalogData,
}: {
  merchantId: string
  squareItemId: string
  catalogVariationId: string
  catalogData: any
}) {
  const catalogDataString = JSON.stringify(catalogData)

  const { data: existing, errors: getErrors } = await cookieBasedClient.models.CatalogItem.get(
    { merchantId, squareItemId },
    { authMode: 'userPool' }
  )

  if (getErrors?.length) {
    console.error('Error getting existing CatalogItem:', getErrors)
    throw new Error(getErrors.map((e) => e.message).join(', '))
  }

  if (existing) {
    const { data: updatedItem, errors: updateErrors } = await cookieBasedClient.models.CatalogItem.update(
      {
        merchantId,
        squareItemId,
        catalogVariationId,
        catalogData: catalogDataString,
      },
      { authMode: 'userPool' }
    )

    if (updateErrors?.length) {
      console.error('Error updating CatalogItem:', updateErrors)
      throw new Error(updateErrors.map((e) => e.message).join(', '))
    }

    return updatedItem
  } else {
    const { data: createdItem, errors: createErrors } = await cookieBasedClient.models.CatalogItem.create(
      {
        merchantId,
        squareItemId,
        catalogVariationId,
        catalogData: catalogDataString,
      },
      { authMode: 'userPool' }
    )

    if (createErrors?.length) {
      console.error('Error creating CatalogItem:', createErrors)
      throw new Error(createErrors.map((e) => e.message).join(', '))
    }

    return createdItem
  }
}

export async function getAuthUrl(merchantId: string): Promise<SquareAuthResponse> {
  console.log('getting auth with merchantId:', merchantId)
  const { data, errors } = await cookieBasedClient.queries.getSquareAuthUrl({ merchantId })

  if (errors?.length) {
    console.error('Error fetching auth url:', errors)
    throw new Error(errors.map((e: any) => e.message).join(', '))
  }

  return { url: data?.url || null, auth: data?.auth || null }
}

export async function getUserBySub(sub: string) {
  const { data, errors } = await cookieBasedClient.models.User.listUserBySub({ sub }, { authMode: 'userPool' })
  if (errors?.length) {
    console.error('Error fetching user:', errors)
    throw new Error(errors.map((e: any) => e.message).join(', '))
  }
  return data[0]
}

export async function getMerchant(merchantId: string): Promise<PublicMerchant | null> {
  const { data, errors } = await cookieBasedClient.models.Merchant.get(
    { id: merchantId },
    { selectionSet: merchantSelectionSet, authMode: 'userPool' }
  )
  if (errors?.length) {
    console.error('Error fetching merchant:', errors)
    throw new Error(errors.map((e: any) => e.message).join(', '))
  }
  return data
}

export async function getServerMerchant(merchantId: string): Promise<Merchant | null> {
  const authMode = (await isAuth()) ? 'userPool' : 'identityPool'
  const { data, errors } = await cookieBasedClient.models.Merchant.get({ id: merchantId }, { authMode })
  if (errors?.length) {
    console.error('Error fetching merchant:', errors)
    throw new Error(errors.map((e: any) => e.message).join(', '))
  }
  return data
}

export async function getPublicMerchantFromHandle(handle: string): Promise<MerchantSelected | undefined> {
  const authMode = (await isAuth()) ? 'userPool' : 'identityPool'
  const { data, errors } = await cookieBasedClient.models.Merchant.listMerchantByHandle(
    { handle },
    { selectionSet: merchantSelectionSet, authMode }
  )
  if (errors?.length) {
    console.error('Error fetching merchant:', errors)
    throw new Error(errors.map((e: any) => e.message).join(', '))
  }
  return data[0]
}

export async function updateMenu(updateMenuInput: UpdateMenuInput) {
  const { data, errors } = await cookieBasedClient.models.Menu.update({ ...updateMenuInput }, { authMode: 'userPool' })
  if (errors?.length) {
    console.error('Error fetching merchant:', errors)
    throw new Error(errors.map((e: any) => e.message).join(', '))
  }
  return data
}

export async function updateMerchant(updateMerchantInput: UpdateMerchantInput) {
  const { data, errors } = await cookieBasedClient.models.Merchant.update(
    { ...updateMerchantInput },
    { authMode: 'userPool' }
  )
  if (errors?.length) {
    console.error('Error fetching merchant:', errors)
    throw new Error(errors.map((e: any) => e.message).join(', '))
  }
  return data
}

export async function createDemoOrder(order: DemoOrderInput) {
  console.log('creating demo order', order)
  const authMode = (await isAuth()) ? 'userPool' : 'identityPool'
  const mockContext = {
    ticketNumber: order.referenceId,
    referenceId: order.referenceId,
    locationId: order.locationId,
    menuSlug: 'demo',
    timeZone: 'America/Los_Angeles',
    email: 'test@test.com',
    phone: '+15555555555',
    orderToken: order.orderToken,
  }

  const rawData = mockSquareOrderFromCart(order.lineItems, mockContext)

  const { data, errors } = await cookieBasedClient.models.DemoOrder.create(
    {
      id: rawData.id,
      fulfillmentStatus: 'PROPOSED',
      locationId: order.locationId,
      merchantId: order.merchantId,
      referenceId: order.referenceId,
      rawData: JSON.stringify(rawData),
      status: 'OPEN',
      totalMoney: 0,
      expiresAt: order.expiresAt,
    },
    { authMode }
  )

  if (errors?.length) {
    console.error('Error creating demo order:', errors)
    throw new Error(errors.map((e: any) => e.message).join(', '))
  }

  return data
}

function getModifierListsForItem(item: SquareItem, all: Record<string, SquareModifierList>): SquareModifierList[] {
  const variation = item.item_data.variations?.[0]
  const info = variation?.item_variation_data?.modifier_list_info || []
  return info.map((entry) => all[entry.modifier_list_id]).filter((list): list is SquareModifierList => Boolean(list))
}

async function getAmplifyDemoOrderById(orderId: string) {
  const authMode = (await isAuth()) ? 'userPool' : 'identityPool'

  const { data, errors } = await cookieBasedClient.models.DemoOrder.get(
    {
      id: orderId,
    },
    { authMode }
  )

  if (errors?.length) {
    console.error('Error fetching demo order:', errors)
    throw new Error(errors.map((e: any) => e.message).join(', '))
  }

  return data
}

async function getAmplifyOrderById(orderId: string) {
  const { data, errors } = await cookieBasedClient.models.Order.get({
    id: orderId,
  })

  if (errors?.length) {
    console.error('Error fetching demo order:', errors)
    throw new Error(errors.map((e: any) => e.message).join(', '))
  }

  return data
}
