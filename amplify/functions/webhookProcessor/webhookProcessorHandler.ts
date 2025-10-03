import { SQSHandler } from 'aws-lambda'
import { isDuplicate, markProcessed as persistProcessedEvent } from './util'
import { createOrder, fulfillmentUpdated, getMerchant, getSquareClient, updateOrder } from './hookHandlers'
import { SquareClient } from 'square'
import { startMetrics, resolveEnv, recordSqsDiagnostics /*, makeSquareTimer*/ } from './metrics'

type SquareEventPayload = {
  merchant_id: string
  event_id: string
  type: string
  data: any
}

type EventHandler = (data: any, eventId: string, merchant_id: string, squareClient: SquareClient) => Promise<void>

const handlers: Record<string, EventHandler> = {
  'order.created': async (data, eventId, merchant_id, squareClient) => {
    console.log(`🆕 Handling order.created: [${eventId}]`)
    await createOrder(data.id, eventId, merchant_id, squareClient)
  },
  'order.updated': async (data, eventId, merchant_id, squareClient) => {
    console.log(`🔄 Handling order.updated: [${eventId}]`)
    await updateOrder(data.id, eventId, merchant_id, squareClient)
  },
  'order.fulfillment.updated': async (data, eventId, merchant_id, squareClient) => {
    console.log(`🔄 Handling order.fulfillment.updated: [${eventId}]`)
    await fulfillmentUpdated(data.object.order_fulfillment_updated, eventId, merchant_id, squareClient)
  },
  'payment.created': async (data, eventId, merchant_id) => {
    console.log(`💳 Handling payment.created: [${eventId}]`)
  },
  'payment.updated': async (data, eventId, merchant_id) => {
    console.log(`💳 Handling payment.updated: [${eventId}]`)
  },
}

export const handler: SQSHandler = async (event, context) => {
  for (const record of event.Records) {
    let snsEnvelope: any
    let payload: SquareEventPayload

    try {
      snsEnvelope = JSON.parse(record.body)
      payload = JSON.parse(snsEnvelope.Message)
    } catch (e) {
      console.error('❌ Bad envelope/payload JSON', e)
      continue
    }

    const { event_id, type, data, merchant_id } = payload
    const m = startMetrics({
      env: resolveEnv(),
      eventType: type,
      awsRequestId: context.awsRequestId,
    })
    m.prop('EventId', event_id)
    m.prop('MerchantId', merchant_id)
    recordSqsDiagnostics(m, record, snsEnvelope?.Timestamp)

    try {
      await m.timeIt('HandlerDurationMs', async () => {
        const isDup = await m.timeIt('IsDuplicateMs', () => isDuplicate(event_id))
        if (isDup) {
          m.markDuplicate()
          return
        }

        const merchant = await m.timeIt('GetMerchantMs', () => getMerchant(merchant_id))
        const squareClient = await getSquareClient(merchant)

        const handlerFn = handlers[type]
        if (!handlerFn) {
          console.warn(`⚠️ No handler for event type: ${type}`)
          m.markNoHandler()
          m.prop('NoHandlerType', type)
          return
        }

        // If you want Square endpoint timings, pass a timer into your hookHandlers later.
        // const timeSquare = makeSquareTimer(m)

        await m.timeIt('HandlerWorkMs', () => handlerFn(data, event_id, merchant_id, squareClient))

        await m.timeIt('MarkProcessedMs', () => persistProcessedEvent(event_id))
        m.markProcessed()
      })
    } catch (err: any) {
      m.markError()
      m.prop('ErrorName', err?.name)
      m.prop('ErrorMessage', err?.message)
      console.error('❌ Error processing record:', err)
    } finally {
      await m.flush()
    }
  }
}
