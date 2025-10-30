// secrets-upsert.ts
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  PutSecretValueCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager'
import { Buffer } from 'node:buffer'

export type MerchantSecret = {
  squareMerchantId: string
  merchantId: string
  accessToken: string
  refreshToken?: string
  squareEnv?: 'sandbox' | 'production'
  updatedAt?: string
}

type AppSecret = {
  clientId: string
  clientSecret: string
  redirectUris?: string[]
  scopes?: string[]
  squareEnv?: 'sandbox' | 'production'
  updatedAt?: string
}

const sm = new SecretsManagerClient({})
const cache = new Map<string, { value: AppSecret; expiresAt: number }>()
const TTL_MS = Number(process.env.SECRET_CACHE_SEC || 60) * 1000
const APP_TTL_MS = Number(process.env.APP_SECRET_CACHE_DAYS ?? 1) * 24 * 60 * 60 * 1000

function secretIdFor(merchantId: string, env: string) {
  const prefix = process.env.MERCHANT_SECRET_PREFIX || `prepeat/${env}/square/merchant`
  return `${prefix}/${merchantId}`
}

export async function getAppSecret(env: string): Promise<AppSecret> {
  const id = `prepeat/${env}/application/square`
  const now = Date.now()
  const hit = cache.get(id)
  if (hit && hit.expiresAt > now) return hit.value

  try {
    const resp = await sm.send(new GetSecretValueCommand({ SecretId: id }))
    const s = resp.SecretString ?? Buffer.from(resp.SecretBinary ?? []).toString('utf8')
    if (!s) throw new Error('EmptySecret')

    const parsed = JSON.parse(s) as Partial<AppSecret>
    if (!parsed.clientId || !parsed.clientSecret) throw new Error('MissingClientFields')

    const value: AppSecret = {
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
      redirectUris: parsed.redirectUris ?? [],
      scopes: parsed.scopes ?? [],
      squareEnv: parsed.squareEnv ?? 'sandbox',
      updatedAt: parsed.updatedAt,
    }

    cache.set(id, { value, expiresAt: now + APP_TTL_MS })
    return value
  } catch (err: any) {
    const name = err?.name || 'UnknownError'
    console.error(`getAppSecret failed for ${id}: ${name}`, err?.message || err)
    // Re-throw so callers can render a 5xx vs silently proceeding with undefined.
    throw err
  }
}

export async function upsertMerchantSecret(secret: MerchantSecret, env: string): Promise<string> {
  console.log('upserting merchant secret:', secret.merchantId, env)
  const client = sm
  const SecretId = secretIdFor(secret.merchantId, env)
  const SecretString = JSON.stringify({
    squareMerchantId: secret.squareMerchantId,
    merchantId: secret.merchantId,
    accessToken: secret.accessToken,
    refreshToken: secret.refreshToken,
    squareEnv: secret.squareEnv ? secret.squareEnv : 'sandbox',
    updatedAt: new Date().toISOString(),
  })

  // Try to describe first; if it exists, update; otherwise create.
  try {
    const describe = await client.send(new DescribeSecretCommand({ SecretId }))
    // exists → update value
    const put = await client.send(new PutSecretValueCommand({ SecretId, SecretString }))
    // Prefer ARN from Put; fall back to Describe
    return put.ARN || describe.ARN || SecretId
  } catch (err: any) {
    if (err?.name === 'ResourceNotFoundException') {
      const create = await client.send(new CreateSecretCommand({ Name: SecretId, SecretString }))
      return create.ARN || SecretId
    }
    // Unknown error → bubble up
    throw err
  }
}
