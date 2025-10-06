// lib/menuCache.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { fetchMenuWithItems } from '@/lib/fetchMenuWithItems' // your existing function
import { putMetric } from '@/lib/metrics'

const TABLE = process.env.MENU_CACHE_TABLE! // e.g., "MenuCache-dev"
console.log(TABLE ?? 'no Cache Table')
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
  console.log('[local SSR] ENV_NAME:', process.env.NEXT_PUBLIC_ENVIRONMENT, 'table:', TABLE)
  const t0 = Date.now()
  const pk = pkOf(merchantId, loc)

  if (!loc || !merchantId) {
    console.error('[MenuCache] called with bad args', { merchantId, loc })
    // Either throw, or bypass cache and fail fast:
    throw new Error('getCachedMenu requires merchantId and loc')
  }

  if (!TABLE) {
    console.error('[MenuCache] MENU_CACHE_TABLE env var is not set')
    // fallback: compute without caching so the page still renders

    return await fetchMenuWithItems(loc)
  }

  // 1) Try cache
  const got = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk } }))
  const snap = got.Item as Snapshot | undefined
  if (snap?.menu && snap?.items) {
    await putMetric('Hit', 1)
    await putMetric('DurationMs', Date.now() - t0)
    return { menu: snap.menu, items: snap.items }
  }
  await putMetric('Miss', 1)
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
    await putMetric('WriteSuccess', 1)
  } catch (e) {
    // Log but don't fail the request—the page can still render with computed data
    await putMetric('WriteError', 1)
    console.error('[MenuCache] Put snapshot failed', { pk, error: e })
  }
  await putMetric('DurationMs', Date.now() - t0)
  return computed
}

/**
 * Invalidate the cache entry for a merchant+loc.
 * Next call to getCachedMenu() will recompute and re-populate.
 *
 * Pass { warm: true } to immediately re-fill the cache after invalidation.
 */
export async function bumpCacheVersion(merchantId: string, loc: string, opts?: { warm?: boolean }): Promise<void> {
  if (!merchantId || !loc) throw new Error('bumpCacheVersion requires merchantId and loc')
  if (!TABLE) {
    console.warn('[MenuCache] bumpCacheVersion: MENU_CACHE_TABLE not set; nothing to invalidate')
    return
  }

  const pk = pkOf(merchantId, loc)

  try {
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { pk } }))
    await putMetric('Invalidate', 1)
  } catch (e) {
    await putMetric('InvalidateError', 1)
    console.error('[MenuCache] bumpCacheVersion delete failed', { pk, error: e })
    // non-fatal
  }

  // Optional warm—recompute and repopulate now (instead of on next read)
  if (opts?.warm) {
    try {
      await getCachedMenu(merchantId, loc) // miss -> compute -> put
      await putMetric('WarmSuccess', 1)
    } catch (e) {
      await putMetric('WarmError', 1)
      console.error('[MenuCache] warm after bump failed', { pk, error: e })
    }
  }
}
