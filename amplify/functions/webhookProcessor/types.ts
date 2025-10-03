import { SquareClient } from 'square'

export type SquareOrderCreatedWebhook = {
  merchant_id: string
  type: 'order.created'
  event_id: string
  created_at: string
  data: {
    type: 'order_created'
    id: string // order ID
    object: {
      order_created: {
        created_at: string
        location_id: string
        order_id: string
        state: 'DRAFT' | 'OPEN' | 'COMPLETED' | 'CANCELED'
        version: number
      }
    }
  }
}

export type SquareOrderUpdatedWebhook = {
  merchant_id: string
  type: 'order.updated'
  event_id: string
  created_at: string
  data: {
    type: 'order_updated'
    id: string // order ID
    object: {
      order_updated: {
        created_at: string
        updated_at: string
        location_id: string
        order_id: string
        state: 'DRAFT' | 'OPEN' | 'COMPLETED' | 'CANCELED'
        version: number
      }
    }
  }
}

export type SquareOrderFulfillmentUpdatedWebhook = {
  merchant_id: string
  type: 'order.fulfillment.updated'
  event_id: string
  created_at: string
  data: {
    type: 'order_fulfillment_updated'
    id: string // order ID
    object: {
      order_fulfillment_updated: {
        created_at: string
        updated_at: string
        location_id: string
        order_id: string
        state: 'DRAFT' | 'OPEN' | 'COMPLETED' | 'CANCELED'
        version: number
        fulfillment_update: Array<{
          fulfillment_uid: string
          new_state: string
          old_state: string
        }>
      }
    }
  }
}

export type SquarePaymentCreatedWebhook = {
  merchant_id: string
  type: 'payment.created'
  event_id: string
  created_at: string
  data: {
    type: 'payment'
    id: string // Payment ID
    object: {
      payment: {
        id: string
        order_id: string
        location_id: string
        status: 'APPROVED' | 'COMPLETED' | 'CANCELED' | string
        receipt_number: string
        source_type: string // e.g., 'EXTERNAL', 'CARD'
        total_money: {
          amount: number
          currency: string
        }
        amount_money: {
          amount: number
          currency: string
        }
        created_at: string
        updated_at: string
        version: number
        capabilities?: string[] // e.g., EDIT_AMOUNT_UP, etc.
        application_details?: {
          application_id: string
          square_product: string
        }
        external_details?: {
          source: string
          type: string
        }
      }
    }
  }
}

export type SquareFulfillmentUpdate = {
  order_id: string
  state: string
  fulfillment_update: Array<{
    fulfillment_uid: string
    new_state: string
    old_state: string
  }>
}

export type UpdateOrderParams = {
  order: {
    id: string
    locationId: string
    referenceId: string
    version: number
    fullFillmentId: string
  }
  referenceId?: string
  source?: string
  recipient?: {
    displayName?: string | null
  }
  client: SquareClient
}

export type SquareWebhookEvent =
  | SquareOrderCreatedWebhook
  | SquareOrderUpdatedWebhook
  | SquareOrderFulfillmentUpdatedWebhook
  | SquarePaymentCreatedWebhook

export type MerchantSecret = {
  merchantId: string
  accessToken: string
  refreshToken?: string
  squareEnv?: 'sandbox' | 'production'
  updatedAt?: string
}
