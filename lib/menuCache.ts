// lib/menuCache.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { fetchMenuWithItems } from '@/lib/fetchMenuWithItems' // your existing function

const TABLE = process.env.MENU_CACHE_TABLE! // e.g., "MenuCache-dev"
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
})

// Compose the partition key into a single string (works with pk-only table)
const pkOf = (merchantId: string, loc: string) => `MENU#${merchantId}#${loc}`

// Types aligned with your existing function
type FetchResult = Awaited<ReturnType<typeof fetchMenuWithItems>>
type Snapshot = {
  pk: string
  merchantId: string
  loc: string
  updatedAt: string
  // Optional: ttl?: number   // only if you want auto-expiry later
  menu: FetchResult['menu']
  items: FetchResult['items']
}

/**
 * Read-through cache:
 *  - Try DynamoDB first.
 *  - On miss, compute via fetchMenuWithItems(loc), persist, return.
 */
export async function getCachedMenu(merchantId: string, loc: string): Promise<FetchResult> {
  const pk = pkOf(merchantId, loc)

  // 1) Try cache
  const got = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk } }))
  const snap = got.Item as Snapshot | undefined
  if (snap?.menu && snap?.items) {
    return { menu: snap.menu, items: snap.items }
  }

  // 2) Cache miss → compute
  const computed = await fetchMenuWithItems(loc)

  // 3) Persist snapshot (best-effort)
  const item: Snapshot = {
    pk,
    merchantId,
    loc,
    updatedAt: new Date().toISOString(),
    // ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // ← enable if you want 24h expiry
    menu: computed.menu,
    items: computed.items,
  }

  try {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }))
  } catch (e) {
    // Log but don't fail the request—the page can still render with computed data
    console.error('[MenuCache] Put snapshot failed', { pk, error: e })
  }

  return computed
}
