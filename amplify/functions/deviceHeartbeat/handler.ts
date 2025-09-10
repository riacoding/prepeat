// amplify/functions/deviceHeartbeat/handler.ts
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import crypto from 'crypto'

const ddb = new DynamoDBClient({})
const DEVICE_TABLE = process.env.DEVICE_TABLE!
const DEVICE_SECRETS_TABLE = process.env.DEVICE_SECRETS_TABLE!

// ---- helpers (canonical, keep as-is) ----
function lowerHeaders(h: Record<string, string | undefined>) {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h || {})) if (typeof v === 'string') out[k.toLowerCase()] = v
  return out
}

function verifyHmac(apiKey: string, timestampIso: string, rawBody: string, signatureHex: string): boolean {
  const canonical = `${timestampIso}\n${rawBody}`
  const expectedHex = crypto.createHmac('sha256', apiKey).update(canonical, 'utf8').digest('hex')
  // constant-time compare; bail if lengths differ or bad hex
  try {
    const a = Buffer.from(expectedHex, 'hex')
    const b = Buffer.from(signatureHex, 'hex')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export const handler = async (event: any) => {
  console.log('event', event)
  try {
    const headers = lowerHeaders(event.headers || {})
    const deviceId = headers['x-device-id']
    const ts = headers['x-timestamp']
    const sig = headers['x-signature']
    if (!deviceId || !ts || !sig) {
      return { statusCode: 401, body: JSON.stringify({ error: 'missing auth headers' }) }
    }

    // 1) timestamp skew (±5 min), expecting ISO-8601
    const tsMs = Date.parse(ts)
    if (!Number.isFinite(tsMs)) return { statusCode: 401, body: JSON.stringify({ error: 'bad timestamp' }) }
    if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
      return { statusCode: 401, body: JSON.stringify({ error: 'timestamp skew' }) }
    }

    // 2) get plaintext apiKey
    const secret = await ddb.send(
      new GetItemCommand({
        TableName: DEVICE_SECRETS_TABLE,
        Key: { deviceId: { S: deviceId } },
        ProjectionExpression: 'apiKey',
      })
    )
    const apiKey = secret.Item?.apiKey?.S
    if (!apiKey) return { statusCode: 403, body: JSON.stringify({ error: 'unknown device' }) }

    // 3) verify HMAC over "<ts>\n<body>"
    const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body ?? {})
    if (!verifyHmac(apiKey, ts, rawBody, sig)) {
      return { statusCode: 403, body: JSON.stringify({ error: 'bad signature' }) }
    }

    // 4) optional payload parse for telemetry
    let data: any = undefined
    try {
      data = rawBody ? JSON.parse(rawBody) : undefined
    } catch {}

    // 5) update Device
    const eav: Record<string, any> = { ':now': { S: new Date().toISOString() } }
    const sets: string[] = ['lastSeenAt = :now']

    const version = headers['x-device-version'] || data?.version
    if (version) {
      sets.push('version = :v')
      eav[':v'] = { S: version }
    }

    const xff = headers['x-forwarded-for']
    if (xff) {
      sets.push('lastIp = :ip')
      eav[':ip'] = { S: xff.split(',')[0].trim() }
    }

    if (typeof data?.rssi === 'number') {
      sets.push('rssi = :r')
      eav[':r'] = { N: String(data.rssi) }
    }
    if (typeof data?.tempC === 'number') {
      sets.push('tempC = :t')
      eav[':t'] = { N: String(data.tempC) }
    }

    await ddb.send(
      new UpdateItemCommand({
        TableName: DEVICE_TABLE,
        Key: { id: { S: deviceId } },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeValues: eav,
      })
    )

    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('heartbeat error', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'server' }) }
  }
}
