import 'dotenv/config'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'

const {
  AWS_REGION = 'us-west-2',
  DDB_TABLE_MERCHANT,
  DDB_TABLE_LOCATION,
  DDB_TABLE_MENU,
  DDB_TABLE_ITEM,
  DDB_TABLE_MODIFIER,
  E2E_VENDOR_HANDLE = 'demo-truck',
  E2E_VENDOR_NAME = 'Demo Truck',
  E2E_OG_IMAGE = '',
} = process.env

if (!DDB_TABLE_MERCHANT || !DDB_TABLE_LOCATION || !DDB_TABLE_MENU || !DDB_TABLE_ITEM || !DDB_TABLE_MODIFIER) {
  console.error('❌ Missing DDB_TABLE_* env vars.')
  process.exit(1)
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }))
const runId = process.env.GITHUB_RUN_ID || Date.now().toString()
const prefix = `e2e-${runId}`
const now = () => new Date().toISOString()

async function upsert(table: string, item: any) {
  await ddb.send(new PutCommand({ TableName: table, Item: item }))
}

async function seed() {
  const merchantId = `${prefix}-merchant`
  const locationId = `${prefix}-loc`
  const menuId = `${prefix}-menu`
  const itemId = `${prefix}-item-margherita`
  const modPepId = `${prefix}-mod-pepperoni`
  const modCheId = `${prefix}-mod-cheese`

  await upsert(DDB_TABLE_MERCHANT!, {
    id: merchantId,
    handle: `${prefix}-${E2E_VENDOR_HANDLE}`,
    name: `${E2E_VENDOR_NAME} (E2E)`,
    ogImageUrl: E2E_OG_IMAGE || `https://cdn.example.com/vendors/${E2E_VENDOR_HANDLE}-og.jpg`,
    createdAt: now(),
  })
  await upsert(DDB_TABLE_LOCATION!, {
    id: locationId,
    merchantId,
    handle: E2E_VENDOR_HANDLE,
    name: `${E2E_VENDOR_NAME} Location`,
    createdAt: now(),
  })
  await upsert(DDB_TABLE_MENU!, { id: menuId, locationId, title: 'Menu of the Day', createdAt: now() })
  await upsert(DDB_TABLE_ITEM!, { id: itemId, menuId, name: 'Margherita', basePriceCents: 1500, createdAt: now() })
  await upsert(DDB_TABLE_MODIFIER!, { id: modPepId, itemId, name: 'Add pepperoni', deltaCents: 200, createdAt: now() })
  await upsert(DDB_TABLE_MODIFIER!, { id: modCheId, itemId, name: 'Extra cheese', deltaCents: 150, createdAt: now() })

  console.log('✅ Seed complete.', { merchantId, locationId, menuId, itemId })
}

async function cleanupOld(prefixStartsWith = 'e2e-') {
  console.log('🧹 Cleaning old E2E records…')
  const tables = [DDB_TABLE_MODIFIER!, DDB_TABLE_ITEM!, DDB_TABLE_MENU!, DDB_TABLE_LOCATION!, DDB_TABLE_MERCHANT!]
  for (const table of tables) {
    const scan = await ddb.send(
      new ScanCommand({
        TableName: table,
        FilterExpression: 'begins_with(#id, :p)',
        ExpressionAttributeNames: { '#id': 'id' },
        ExpressionAttributeValues: { ':p': prefixStartsWith },
        ProjectionExpression: 'id',
      })
    )
    const ids = (scan.Items ?? []).map((i) => ({ DeleteRequest: { Key: { id: (i as any).id } } }))
    for (let i = 0; i < ids.length; i += 25) {
      const chunk = ids.slice(i, i + 25)
      if (chunk.length) await ddb.send(new BatchWriteCommand({ RequestItems: { [table]: chunk } }))
    }
  }
  console.log('✅ Cleanup complete.')
}

;(async () => {
  if (process.argv.includes('--clean')) return void cleanupOld()
  if (process.argv.includes('--preclean')) await cleanupOld()
  await seed()
})().catch((e) => {
  console.error('❌ Seed failed', e)
  process.exit(1)
})
