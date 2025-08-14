import { config } from '@dotenvx/dotenvx'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'

config({ path: '.env.local', override: false })

// ---- ENV ----
const {
  AWS_REGION = 'us-west-2',

  DDB_TABLE_MERCHANT,
  DDB_TABLE_MENU,
  DDB_TABLE_MENUITEM,
  DDB_TABLE_CATALOGITEM,
  DDB_TABLE_TOPPING,
  DDB_TABLE_ITEMTOPPING,

  E2E_VENDOR_HANDLE = 'demo-truck',
  E2E_VENDOR_NAME = 'Demo Truck',
  E2E_LOCATION_ID = 'demo-loc',
  E2E_TAX_RATE = '8.75', // percent string
  E2E_BASE_PRICE_CENTS = '1500', // cents string; 1500 -> $15.00
  E2E_VARIATION_ID = 'E2E-PIZZA-MARG-V1',
  E2E_SQUARE_ITEM_ID = 'E2E-PIZZA-MARG',
} = process.env

const REQUIRED = [
  'DDB_TABLE_MERCHANT',
  'DDB_TABLE_MENU',
  'DDB_TABLE_MENUITEM',
  'DDB_TABLE_CATALOGITEM',
  'DDB_TABLE_TOPPING',
  'DDB_TABLE_ITEMTOPPING',
] as const

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`❌ Missing env var: ${key}`)
    process.exit(1)
  }
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }))

const runId = process.env.GITHUB_RUN_ID || Date.now().toString()
const prefix = `e2e-${runId}`
const now = () => new Date().toISOString()

// ---- HELPERS ----
async function put(table: string, item: any) {
  await ddb.send(new PutCommand({ TableName: table, Item: item }))
}

function dollarsToFloat(n: number) {
  return Number.isFinite(n) ? n : 0
}

const basePriceCents = Number(E2E_BASE_PRICE_CENTS)
const taxRatePercent = Number(E2E_TAX_RATE)

// ---- SEED ----
async function seed() {
  // IDs we control
  const merchantId = `${prefix}-merchant`
  const menuId = `${prefix}-menu`
  const menuItemId = `${prefix}-menuitem-marg`
  const toppingPepId = `${prefix}-top-pepperoni`
  const toppingCheId = `${prefix}-top-cheese`
  const itemToppingPepId = `${prefix}-it-pep`
  const itemToppingCheId = `${prefix}-it-che`

  // 1) MERCHANT
  await put(DDB_TABLE_MERCHANT!, {
    id: merchantId,
    handle: E2E_VENDOR_HANDLE, // secondary index on handle
    squareMerchantId: 'E2E', // dummy
    accessToken: 'TEST',
    refreshToken: 'TEST',
    businessName: E2E_VENDOR_NAME,
    locationIds: [E2E_LOCATION_ID],
    s3ItemKey: null,
    isLinked: true,
    displayImages: true,
    taxRate: taxRatePercent, // float percent
    isTaxable: true,
    timeZone: 'America/Los_Angeles', // your UI expects this TZ
    createdAt: now(),
    updatedAt: now(),
    __typename: 'Merchant',
  })

  // 2) MENU
  await put(DDB_TABLE_MENU!, {
    id: menuId,
    merchantId,
    name: 'Menu of the Day',
    squareLocationId: 'E2E-LOC',
    locationId: E2E_LOCATION_ID, // used in your menu route/provider
    logo: null,
    isActive: true,
    isOffline: false,
    theme: {},
    useImages: true,
    createdAt: now(),
    updatedAt: now(),
    __typename: 'Menu',
  })

  // 3) CATALOG ITEM (composite key: merchantId + squareItemId)
  const squareItemId = E2E_SQUARE_ITEM_ID
  const variationId = E2E_VARIATION_ID

  const pepperoniModifierId = 'E2E-MOD-PEPPERONI'
  const cheeseModifierId = 'E2E-MOD-CHEESE'
  const modListId = 'E2E-MODLIST-PIZZA'

  const catalogData = {
    item: {
      id: squareItemId,
      type: 'ITEM',
      created_at: now(),
      updated_at: now(),
      is_deleted: false,
      present_at_all_locations: true,
      item_data: {
        name: 'Margherita',
        description: 'Fior di Latte Mozzarella/Fresh Basil',
        description_html: '<p>Fior di Latte Mozzarella/Fresh Basil</p>',
        description_plaintext: 'Fior di Latte Mozzarella/Fresh Basil',
        is_alcoholic: false,
        is_archived: false,
        is_taxable: true,
        product_type: 'FOOD_AND_BEV',
        skip_modifier_screen: false,
        // Tell Square that this item uses our modifier list
        modifier_list_info: [{ enabled: true, modifier_list_id: modListId }],
        variations: [
          {
            id: variationId,
            type: 'ITEM_VARIATION',
            created_at: now(),
            updated_at: now(),
            present_at_all_locations: true,
            is_deleted: false,
            version: Date.now(),
            item_variation_data: {
              item_id: squareItemId,
              name: 'Regular',
              ordinal: 1,
              price_money: { amount: basePriceCents, currency: 'USD' },
              pricing_type: 'FIXED_PRICING',
              sellable: true,
              stockable: true,
              track_inventory: false,
              // (Optional) You can also attach modifier_list_info at variation level:
              // modifier_list_info: [{ enabled: true, modifier_list_id: modListId }]
            },
          },
        ],
      },
    },
    // ←— add Square-like modifier lists here —→
    modifierLists: [
      {
        id: modListId,
        type: 'MODIFIER_LIST',
        modifier_list_data: {
          name: 'Pizza Extras',
          modifiers: [
            {
              id: pepperoniModifierId,
              type: 'MODIFIER',
              modifier_data: {
                name: 'Add pepperoni',
                price_money: { amount: 200, currency: 'USD' }, // $2.00
                on_by_default: false,
              },
            },
            {
              id: cheeseModifierId,
              type: 'MODIFIER',
              modifier_data: {
                name: 'Extra cheese',
                price_money: { amount: 150, currency: 'USD' }, // $1.50
                on_by_default: false,
              },
            },
          ],
        },
      },
    ],
  }

  await put(DDB_TABLE_CATALOGITEM!, {
    merchantId, // PK
    squareItemId, // SK
    catalogVariationId: variationId,
    s3ItemKey: null,
    catalogData,
    createdAt: now(),
    updatedAt: now(),
    __typename: 'CatalogItem',
  })

  // 4) MENU ITEM (links to CatalogItem via catalogItemId)
  await put(DDB_TABLE_MENUITEM!, {
    id: menuItemId,
    merchantId,
    menuId,
    catalogItemId: squareItemId, // link to CatalogItem.squareItemId
    s3ImageKey: null,
    customName: 'Margherita',
    isFeatured: false,
    sortOrder: 1,
    createdAt: now(),
    updatedAt: now(),
    __typename: 'MenuItem',
  })

  // 5) TOPPINGS (float dollars per your schema)
  await put(DDB_TABLE_TOPPING!, {
    id: toppingPepId,
    name: 'Add pepperoni',
    price: dollarsToFloat(2.0),
    createdAt: now(),
    updatedAt: now(),
    __typename: 'Topping',
  })
  await put(DDB_TABLE_TOPPING!, {
    id: toppingCheId,
    name: 'Extra cheese',
    price: dollarsToFloat(1.5),
    createdAt: now(),
    updatedAt: now(),
    __typename: 'Topping',
  })

  // 6) ITEM-TOPPING links (connect toppings to menu item)
  await put(DDB_TABLE_ITEMTOPPING!, {
    id: itemToppingPepId,
    isDefault: false,
    isLocked: false,
    menuItemId: menuItemId,
    toppingId: toppingPepId,
    createdAt: now(),
    updatedAt: now(),
    __typename: 'ItemTopping',
  })
  await put(DDB_TABLE_ITEMTOPPING!, {
    id: itemToppingCheId,
    isDefault: false,
    isLocked: false,
    menuItemId: menuItemId,
    toppingId: toppingCheId,
    createdAt: now(),
    updatedAt: now(),
    __typename: 'ItemTopping',
  })

  console.log('✅ Seeded E2E data', {
    merchantId,
    menuId,
    menuItemId,
    squareItemId,
    variationId,
    toppings: [toppingPepId, toppingCheId],
    vendorHandle: E2E_VENDOR_HANDLE,
    locationId: E2E_LOCATION_ID,
    basePriceCents,
  })
}

// ---- CLEANUP (remove old e2e-* rows) ----
// - Single-key tables (id): delete rows where id begins_with('e2e-')
// - CatalogItem (composite key): delete rows where merchantId begins_with('e2e-')
async function cleanupOld(prefixStartsWith = 'e2e-') {
  console.log('🧹 Cleaning old E2E records…')
  // helper to batch delete by single hash key "id"
  async function wipeTableById(table: string) {
    const scan = await ddb.send(
      new ScanCommand({
        TableName: table,
        FilterExpression: 'begins_with(#id, :p)',
        ExpressionAttributeNames: { '#id': 'id' },
        ExpressionAttributeValues: { ':p': prefixStartsWith },
        ProjectionExpression: 'id',
      })
    )
    const items = scan.Items ?? []
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25).map((i) => ({ DeleteRequest: { Key: { id: (i as any).id } } }))
      if (chunk.length) {
        await ddb.send(new BatchWriteCommand({ RequestItems: { [table]: chunk } }))
      }
    }
    console.log(` - ${table}: deleted ${items.length}`)
  }

  // CatalogItem: composite key
  async function wipeCatalogItems(table: string) {
    const scan = await ddb.send(
      new ScanCommand({
        TableName: table,
        // merchantId begins_with 'e2e-'
        FilterExpression: 'begins_with(#pk, :p)',
        ExpressionAttributeNames: { '#pk': 'merchantId' },
        ExpressionAttributeValues: { ':p': prefixStartsWith },
        ProjectionExpression: 'merchantId, squareItemId',
      })
    )
    const items = scan.Items ?? []
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25).map((i) => ({
        DeleteRequest: { Key: { merchantId: (i as any).merchantId, squareItemId: (i as any).squareItemId } },
      }))
      if (chunk.length) {
        await ddb.send(new BatchWriteCommand({ RequestItems: { [table]: chunk } }))
      }
    }
    console.log(` - ${table}: deleted ${items.length}`)
  }

  await wipeTableById(DDB_TABLE_ITEMTOPPING!)
  await wipeTableById(DDB_TABLE_TOPPING!)
  await wipeTableById(DDB_TABLE_MENUITEM!)
  await wipeCatalogItems(DDB_TABLE_CATALOGITEM!)
  await wipeTableById(DDB_TABLE_MENU!)
  await wipeTableById(DDB_TABLE_MERCHANT!)

  console.log('✅ Cleanup complete.')
}

// ---- CLI ENTRYPOINT ----
;(async () => {
  try {
    if (process.argv.includes('--clean')) {
      await cleanupOld()
      return
    }
    if (process.argv.includes('--preclean')) {
      await cleanupOld()
    }
    await seed()
  } catch (e) {
    console.error('❌ Seed failed', e)
    process.exit(1)
  }
})()
