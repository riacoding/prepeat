// demoNotifyPhone Lambda Handler
import crypto from 'crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import twilio from 'twilio'
import type { Schema } from '../../data/resource'
import { env } from '$amplify/env/demoNotifyPhone'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const E164 = /^\+?[1-9]\d{1,14}$/
const utcDay = () => new Date().toISOString().slice(0, 10)

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!, { timeout: 10_000 })
const TWILIO_FROM = process.env.TWILIO_FROM! // E.164 number OR MGxxxxxxxx SID

export const handler: Schema['demoNotifyPhone']['functionHandler'] = async (event) => {
  const { phone: raw, referenceId } = event.arguments

  const cleaned = (raw ?? '').trim()
  const phone = cleaned.startsWith('+') ? cleaned : `+${cleaned.replace(/\D/g, '')}`

  const last4 = phone.replace(/\D/g, '').slice(-4) || '????'
  console.info(JSON.stringify({ referenceId, event: 'demoNotifyPhone', last4, stage: 'received' }))
  putMetric('received')

  if (!E164.test(phone)) {
    console.warn(JSON.stringify({ referenceId, event: 'demoNotifyPhone', stage: 'invalid_phone', last4 }))
    putMetric('invalid_phone')
    return // void
  }

  // ===== Rate limit: 3 sends per UTC calendar day =====
  const pk = crypto.createHash('sha1').update(phone).digest('hex')
  const sk = utcDay()
  const ttl = Math.floor(Date.now() / 1000) + 27 * 60 * 60

  try {
    if (!env.QUOTA_TABLE_NAME) {
      console.warn(JSON.stringify({ referenceId, event: 'demoNotifyPhone', stage: 'no_quota_table', last4 }))
    } else {
      await ddb.send(
        new UpdateCommand({
          TableName: env.QUOTA_TABLE_NAME!,
          Key: { pk, sk },
          UpdateExpression: 'SET #c = if_not_exists(#c, :z) + :one, #ttl = :ttl',
          ConditionExpression: 'attribute_not_exists(#c) OR #c < :limit',
          ExpressionAttributeNames: {
            '#c': 'count',
            '#ttl': 'ttl', // <-- alias the TTL attribute
          },
          ExpressionAttributeValues: {
            ':z': 0,
            ':one': 1,
            ':limit': 3,
            ':ttl': ttl, // number (epoch seconds)
          },
          ReturnValues: 'UPDATED_NEW',
        })
      )
    }
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      console.info(JSON.stringify({ referenceId, event: 'demoNotifyPhone', stage: 'rate_limited', last4 }))
      putMetric('rate_limited')
      return
    }
    console.error(
      JSON.stringify({ referenceId, event: 'demoNotifyPhone', stage: 'quota_error', last4, err: String(err) })
    )
    return
  }

  // Build message safely
  const orderNumber = (referenceId ?? '').split('-')[2] ?? referenceId ?? '???'
  const message = ` Your demo order #${orderNumber} is ready! Pick it up now.`

  // Twilio types to avoid `any`
  type MsgOpts = Parameters<typeof twilioClient.messages.create>[0]

  try {
    const from = (TWILIO_FROM ?? '').trim()
    const msgParams: MsgOpts = { to: phone, body: message }

    if (from.startsWith('MG')) {
      ;(msgParams as any).messagingServiceSid = from // Twilio types don't allow both; cast is fine here
    } else {
      msgParams.from = from
    }

    // Optional: delivery receipts
    // msgParams.statusCallback = `${env.DEMO_NOTIFY_ENDPOINT}/twilio-status`;

    const res = await twilioClient.messages.create(msgParams)
    const sidTail = res.sid?.slice(-6) ?? ''
    console.info(JSON.stringify({ referenceId, event: 'demoNotifyPhone', stage: 'sent', last4, sidTail }))
    putMetric('sent')
  } catch (err: any) {
    // Grab Twilio fields if present
    const twilioCode = err?.code
    const twilioStatus = err?.status
    const moreInfo = err?.moreInfo
    console.error(
      JSON.stringify({
        referenceId,
        event: 'demoNotifyPhone',
        stage: 'notify_failed',
        last4,
        message: String(err?.message ?? err),
        twilioCode,
        twilioStatus,
        moreInfo,
      })
    )
    putMetric('notify_failed')
  }

  return // still void; accepted/reason
}

// Tiny EMF helper
function putMetric(stage: 'received' | 'invalid_phone' | 'rate_limited' | 'sent' | 'notify_failed', count = 1) {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'Prepeat/DemoNotify', // <— your custom namespace
            Dimensions: [['stage']], // one dimension: stage
            Metrics: [{ Name: 'Count', Unit: 'Count' }],
            // Optional high-res (1-second): add StorageResolution: 1 to the metric object
            // Metrics: [{ Name: 'Count', Unit: 'Count', StorageResolution: 1 }],
          },
        ],
      },
      stage, // dimension value
      Count: count,
    })
  )
}
