// lib/ddbCache.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'

const TABLE = process.env.DDB_MENU_CACHE_TABLE!
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const now = () => Math.floor(Date.now() / 1000)

export async function ddbGet<T = unknown>(pk: string): Promise<T | null> {
  const { Item } = await client.send(new GetCommand({ TableName: TABLE, Key: { pk }, ConsistentRead: false }))
  if (!Item) return null
  if (typeof Item.ttl === 'number' && Item.ttl <= now()) return null // expired
  try {
    return JSON.parse(Item.v) as T
  } catch {
    return null
  }
}

export async function ddbPut<T = unknown>(pk: string, value: T, ttlSeconds: number): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk, ttl: now() + ttlSeconds, v: JSON.stringify(value) },
    })
  )
}

export async function ddbDel(pk: string): Promise<void> {
  await client.send(new DeleteCommand({ TableName: TABLE, Key: { pk } }))
}
