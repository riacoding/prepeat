//demoNotifyPhone Lambda Handler
import type { Schema } from '../../data/resource'
import twilio from 'twilio'

const E164 = /^\+?[1-9]\d{1,14}$/

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const TWILIO_FROM = process.env.TWILIO_FROM! // your Twilio number or messaging service SID

export const handler: Schema['demoNotifyPhone']['functionHandler'] = async (event) => {
  const { phone: raw, referenceId } = event.arguments

  const phone = raw.trim().startsWith('+') ? raw : `+${raw.replace(/\D/g, '')}`

  // --- Log only the last 4 digits (never the full number)
  const last4 = phone.replace(/\D/g, '').slice(-4) || '????'
  console.info(JSON.stringify({ referenceId: referenceId, event: 'demoNotifyPhone', last4, stage: 'received' }))

  if (!E164.test(phone)) {
    return
  }

  const message = `🎉 Your demo order #${referenceId} is ready! Pick it up now.`

  await twilioClient.messages.create({
    to: phone,
    from: TWILIO_FROM,
    body: message,
  })

  return
}
