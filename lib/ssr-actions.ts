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
import { headers } from 'next/headers'
import { cookieBasedClient, getCurrentUserServer } from '@/util/amplify'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { Buffer } from 'node:buffer'

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
  ActionState,
  SquareItemVariation,
  CatalogVariationInput,
} from '@/types'
import { extractReceiptItems, isEmail, md5Hex, orderNumberToTicket } from './utils'
import { Square, SquareClient, SquareEnvironment } from 'square'
import { randomUUID } from 'crypto'
import { sanitizeBigInts } from '@/amplify/functions/webhookProcessor/util'
import { mockSquareOrderFromCart } from './mockSquareOrderFromCart'
import { MerchantSecret } from '@/app/(prepeat)/square/callback/secrets-upsert'
const SQUARE_BASE_URL = 'https://connect.squareupsandbox.com/v2'
const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN

// Narrowed envelope types
type ItemObject = Square.CatalogObject & { type: 'ITEM'; itemData: Square.CatalogItem }
type VariationObject = Square.CatalogObject & { type: 'ITEM_VARIATION'; itemVariationData: Square.CatalogItemVariation }
type ModifierListObject = Square.CatalogObject & { type: 'MODIFIER_LIST'; modifierListData: Square.CatalogModifierList }
type ModifierObject = Square.CatalogObject & { type: 'MODIFIER'; modifierData: Square.CatalogModifier }
// allow test to inject a no-op saver
type SaveModifierListFn = (input: {
  merchantId: string
  modifierListId: string
  name: string
  modifiers: Array<{ id: string; name: string; priceMoney: { amount: string; currency: string } }>
}) => Promise<any>

export type ItemWithModifiers = {
  item: ItemObject // envelope: has id/version + itemData
  modifierLists: ModifierListObject[] // envelopes: have id/version + modifierListData
}

const isItemObject = (
  o: Square.CatalogObject
): o is Square.CatalogObject & { type: 'ITEM'; itemData: Square.CatalogItem } => o.type === 'ITEM' && !!o.itemData

const isVariationObject = (
  o: Square.CatalogObject
): o is Square.CatalogObject & { type: 'ITEM_VARIATION'; itemVariationData: Square.CatalogItemVariation } =>
  o.type === 'ITEM_VARIATION' && !!o.itemVariationData

const isModifierListObject = (o: Square.CatalogObject | undefined): o is ModifierListObject =>
  !!o && o.type === 'MODIFIER_LIST' && !!o.modifierListData

const isModifierObject = (
  o?: Square.CatalogObject
): o is Square.CatalogObject & { type: 'MODIFIER'; modifierData: Square.CatalogModifier } =>
  !!o && o.type === 'MODIFIER' && !!o.modifierData

const bigIntToJSON = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)

const sm = new SecretsManagerClient({})

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

export async function getSquareClient(secretsArn: string): Promise<SquareClient | null> {
  if (!secretsArn) return null
  const secret = await getMerchantSecretByArn(secretsArn)
  if (!secret) return null
  return new SquareClient({
    token: secret.accessToken,
    environment: secret.squareEnv === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
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
  orderId: string,
  locationId: string,
  newState: FulfillmentState,
  merchantId: string
) {
  console.log(`Updating order ${orderId} at Location:${locationId} to ${newState.state}`)
  const authMode = (await isAuth()) ? 'userPool' : 'identityPool'

  // 🛑 Detect and handle demo orders
  if (orderId.startsWith('demo-')) {
    console.log(`[updateSquareOrder] Skipping Square update — demo order ${orderId}`)

    // Fetch the Amplify order by ID
    const amplifyOrder = await getAmplifyDemoOrderById(orderId)

    if (!amplifyOrder?.rawData) {
      console.warn(`[updateSquareOrder] Demo order ${orderId} missing rawData`)
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
      { referenceId: amplifyOrder.referenceId ?? '' },
      { authMode }
    )

    console.log('debug:', phones)

    if (phoneErrors?.length) {
      console.error('Amplify fetch phone errors:', phoneErrors)
      return
    }

    if (!phones?.length) {
      console.warn(`No matching phone record found for demo order ${amplifyOrder.referenceId}`)
      return
    }

    cookieBasedClient.mutations.demoNotifyPhone(
      {
        phone: phones[0].phone,
        referenceId: amplifyOrder.referenceId!,
      },
      { authMode }
    )

    return
  }

  const merchant = await getServerMerchant(merchantId)
  if (!merchant || !merchant.secretsArn) return
  const client = await getSquareClient(merchant.secretsArn)
  if (!client) return

  try {
    // Step 1: Fetch existing order
    const { order } = await client.orders.get({ orderId: orderId })

    if (!order || !order.fulfillments || order.fulfillments.length !== 1) {
      throw new Error(`Unexpected fulfillment state: ${JSON.stringify(order?.fulfillments)}`)
    }

    const fulfillment = order.fulfillments[0]

    // Step 2: Update the state
    fulfillment.state = newState.state

    // Step 3: Send the full fulfillment object back in the update
    const { order: newOrder } = await client.orders.update({
      orderId: orderId,
      idempotencyKey: randomUUID(),
      order: {
        version: order.version!,
        locationId,
        fulfillments: [fulfillment],
      },
    })

    console.log(`Square Order ${orderId} successfully updated.`)
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
      item: ItemObject
      modifierLists?: ModifierListObject[]
    }
    const { item, modifierLists } = parsed as {
      item: ItemObject
      modifierLists?: ModifierListObject[]
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

export async function getSquareItemsWithModifiers(
  merchant: Merchant,
  client: SquareClient,
  deps: { saveModifierList?: SaveModifierListFn } = {}
): Promise<ItemWithModifiers[]> {
  try {
    if (!client) return []

    // stream everything once
    const pager = await client.catalog.list({ types: 'ITEM,MODIFIER_LIST' })
    const items: Square.CatalogObject[] = []
    const lists: Square.CatalogObject[] = []

    for await (const obj of pager) {
      if (obj.type === 'ITEM') items.push(obj)
      else if (obj.type === 'MODIFIER_LIST') lists.push(obj)
    }

    const validItems = items.filter(isItemObject)

    // build a map of lists we already have
    const listMap = new Map<string, ModifierListObject>()
    for (const l of lists) {
      if (isModifierListObject(l) && l.id) listMap.set(l.id, l)
    }

    // collect all list ids referenced by items
    const neededListIds = new Set<string>()
    for (const it of validItems) {
      for (const info of it.itemData.modifierListInfo ?? []) {
        if (info.enabled && info.modifierListId) neededListIds.add(info.modifierListId)
      }
    }

    // fetch any missing lists (ideally zero if list() returned all)
    await Promise.all(
      [...neededListIds].map(async (id) => {
        if (listMap.has(id)) return
        const { object } = await client.catalog.object.get({ objectId: id })
        if (isModifierListObject(object) && object.id) listMap.set(object.id, object)
      })
    )

    // persist lists once (idempotent), via injected saver if provided

    await Promise.all(
      [...neededListIds].map(async (id) => {
        const ml = listMap.get(id)
        if (!ml) return
        const rows = (ml.modifierListData.modifiers ?? []).filter(isModifierObject).map((m) => ({
          id: m.id!, // modifier envelope id
          name: m.modifierData.name ?? '',
          priceMoney: m.modifierData.priceMoney
            ? {
                amount: String(m.modifierData.priceMoney.amount), // BigInt → string
                currency: m.modifierData.priceMoney.currency ?? 'USD',
              }
            : { amount: '0', currency: 'USD' },
        }))

        if (deps.saveModifierList) {
          await deps.saveModifierList!({
            merchantId: merchant.id,
            modifierListId: ml.id!, // list envelope id
            name: ml.modifierListData.name ?? '',
            modifiers: rows,
          })
        } else {
          await createModifierList({
            merchantId: merchant.id,
            modifierListId: ml.id!, // list envelope id
            name: ml.modifierListData.name ?? '',
            modifiers: rows,
          })
        }
      })
    )

    // assemble result for callers
    return validItems.map((item): ItemWithModifiers => {
      const ids = new Set<string>(
        (item.itemData.modifierListInfo ?? []).map((i) => i.modifierListId).filter((x): x is string => !!x)
      )
      const resolved = [...ids].map((id) => listMap.get(id)).filter((x): x is ModifierListObject => !!x)

      return { item, modifierLists: resolved }
    })
  } catch (e) {
    console.log(e)
    return []
  }
}

export async function createModifierList(input: {
  merchantId: string
  modifierListId: string
  name: string
  modifiers: Array<{ id: string; name: string; priceMoney: { amount: string; currency: string } }>
}) {
  console.log('Creating ModifierList:', input)
  const { data, errors } = await cookieBasedClient.models.ModifierList.create(input, { authMode: 'userPool' })

  if (errors?.length) {
    console.error('Create failed:', errors)
    throw new Error(errors.map((e) => e.message).join(', '))
  }

  return { merchantId: data?.merchantId, modifierListId: data?.modifierListId }
}

export async function syncMenuItems(merchant: PublicMerchant) {
  try {
    const serverMerchant = await getServerMerchant(merchant.id)
    if (!serverMerchant?.secretsArn) return

    const client = await getSquareClient(serverMerchant.secretsArn)
    if (!client) return

    // Expecting: { item: CatalogItem (payload with variations[] as envelopes), modifierLists: CatalogModifierList[] }
    const itemsWithModifiers = await getSquareItemsWithModifiers(serverMerchant, client)

    console.log('items to sync', JSON.stringify(itemsWithModifiers.slice(0, 2), bigIntToJSON, 2)) // sample

    for (const { item, modifierLists } of itemsWithModifiers) {
      // item.variations is an array of CatalogObject envelopes
      const variations = item.itemData.variations?.filter(isVariationObject) ?? []

      // Collect modifier list IDs attached to this item (and variations)
      const itemLevelListIds = new Set<string>()
      for (const info of item.itemData.modifierListInfo ?? []) {
        if (info.enabled && info.modifierListId) itemLevelListIds.add(info.modifierListId)
      }

      for (const vObj of variations) {
        const v = vObj.itemVariationData
        const catalogVariationId = vObj.id // <- THIS is what Orders reference
        const parentItemId = v.itemId // link back to the Item
        const variationName = v.name ?? ''
        const sku = v.sku ?? null

        // Square Money uses BigInt for amount; choose number or string:
        const priceAmount = v.priceMoney?.amount ? Number(v.priceMoney.amount) : null // ok for small values
        const currency = v.priceMoney?.currency ?? null

        // Minimal payload you upsert
        const catalogData = {
          itemName: item.itemData.name ?? '',
          variationName: v.name ?? '',
          sku: v.sku ?? null,
          price: v.priceMoney?.amount ? Number(v.priceMoney.amount) : null,
          currency: v.priceMoney?.currency ?? null,
          // keeping versions is handy for future upserts
          versions: {
            itemVersion: item.version ? String(item.version) : null,
            variationVersion: vObj.version ? String(vObj.version) : null,
          },
          // (optional) full list envelopes if you want names, etc.
          modifierLists,
        }

        try {
          await upsertCatalogVariationItem({
            merchantId: merchant.id,
            catalogVariationId, // string
            parentItemId: parentItemId!,
            squareItemId: parentItemId!,
            variationName,
            sku,
            priceCents: priceAmount,
            currency,
            modifierListIds: Array.from(itemLevelListIds.keys()),
            itemVersion: item.version ? String(item.version) : null,
            variationVersion: vObj.version ? String(vObj.version) : null,
            catalogData, // your snapshot/cache
          })
        } catch (err) {
          console.log(`Error upserting catalog variation: ${catalogVariationId}`, err)
        }
      }
    }
  } catch (error) {
    console.log(`Error Syncing menu items: ${error}`)
  }
}

export async function setupWebhooks() {}

export async function createDefaultMenu() {}

export async function upsertCatalogVariationItem(input: CatalogVariationInput) {
  const { merchantId, catalogVariationId } = input

  if (!merchantId || !catalogVariationId) {
    throw new Error('Missing required fields: merchantId and catalogVariationId for Upsert')
  }
  const { data: existing, errors: getErrors } = await cookieBasedClient.models.CatalogVariation.get(
    { merchantId, catalogVariationId },
    { authMode: 'userPool' }
  )

  if (getErrors?.length) {
    console.error('Error getting existing CatalogItem:', getErrors)
    throw new Error(getErrors.map((e) => e.message).join(', '))
  }

  if (existing) {
    const { data: updatedItem, errors: updateErrors } = await cookieBasedClient.models.CatalogVariation.update(input, {
      authMode: 'userPool',
    })

    if (updateErrors?.length) {
      console.error('Error updating CatalogVariation:', updateErrors)
      throw new Error(updateErrors.map((e) => e.message).join(', '))
    }

    return updatedItem
  } else {
    const { data: createdItem, errors: createErrors } = await cookieBasedClient.models.CatalogVariation.create(input, {
      authMode: 'userPool',
    })

    if (createErrors?.length) {
      console.error('Error creating CatalogVariation:', createErrors)
      throw new Error(createErrors.map((e) => e.message).join(', '))
    }

    return createdItem
  }
}

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

  return { url: data?.url || null, state: data?.state || null }
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

export async function subscribeEmailAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const authMode = (await isAuth()) ? 'userPool' : 'identityPool'
  const emailRaw = String(formData.get('email') ?? '').trim()
  const placement = String(formData.get('placement') ?? 'homepage_hero')
  const url = String(formData.get('url') ?? '')
  const utm_source = String(formData.get('utm_source') ?? '') || undefined
  const utm_medium = String(formData.get('utm_medium') ?? '') || undefined
  const utm_campaign = String(formData.get('utm_campaign') ?? '') || undefined
  const honeypot = String(formData.get('website') ?? '') // bot trap

  if (honeypot) {
    // Silently succeed (don’t confirm to bots).
    return { ok: true, message: 'Thanks!' }
  }
  if (!isEmail(emailRaw)) {
    return { ok: false, message: 'Please enter a valid email.' }
  }

  const emailLower = emailRaw.toLowerCase()
  const emailHash = md5Hex(emailLower)
  const now = new Date().toISOString()
  const hdrs = await headers()
  const userAgent = hdrs.get('user-agent') ?? undefined

  try {
    const { data, errors } = await cookieBasedClient.models.Subscriber.create(
      {
        id: emailLower,
        email: emailLower,
        status: 'subscribed', // enum default applied here
        optInType: 'single',
        consent: {
          method: 'webform',
          timestamp: now,
          policyVersion: 'v1',
          text: 'By subscribing, you agree to receive emails from Prepeat. Unsubscribe anytime.',
        },
        source: {
          placement: placement as any, // "homepage_hero" | "footer" | "modal"
          url,
          utm: { source: utm_source, medium: utm_medium, campaign: utm_campaign },
        },
        tags: [placement],
        userAgent: userAgent || undefined,
        export: { status: 'pending', provider: 'mailchimp', emailHash },
        createdAt: now,
        updatedAt: now,
      },
      { authMode }
    )

    if (errors?.length) {
      console.error('create Subscriber errors:', errors)
      // Optional: surface the first message
      throw new Error(errors.map((e) => e.message).join('; '))
    }
    console.log('subscriber:', data)
    return { ok: true, message: 'You’re on the list. Thanks!' }
  } catch (err: any) {
    const msg = String(err?.errors?.[0]?.message ?? err?.message ?? '')
    // Treat duplicates as success (idempotent UX)
    if (msg.includes('already exists') || msg.includes('The conditional request failed')) {
      return { ok: true, message: 'You’re already on the list. Thanks!' }
    }
    console.error('subscribeEmail error:', err)
    return { ok: false, message: 'Something went wrong. Please try again.' }
  }
}

export async function getMerchantSecretByArn(secretArn: string): Promise<MerchantSecret> {
  if (!secretArn) throw new Error('Missing secret ARN')

  const resp = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }))
  const raw = resp.SecretString ?? (resp.SecretBinary ? Buffer.from(resp.SecretBinary).toString('utf8') : '')
  if (!raw) throw new Error('EmptySecret')

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('BadSecretJSON')
  }

  if (!parsed.merchantId || !parsed.accessToken) {
    throw new Error('Missing merchantId or accessToken in secret')
  }

  return {
    merchantId: String(parsed.merchantId),
    accessToken: String(parsed.accessToken),
    refreshToken: parsed.refreshToken ? String(parsed.refreshToken) : undefined,
    squareEnv: parsed.squareEnv === 'production' ? 'production' : 'sandbox',
    updatedAt: parsed.updatedAt ? String(parsed.updatedAt) : undefined,
  }
}
