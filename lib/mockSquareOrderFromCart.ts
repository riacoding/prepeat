type MockCartItem = {
  name: string
  quantity: number
  price: number
  catalogItemId: string
  variationId?: string
  variationName?: string
  note?: string
  metadata?: Record<string, string>
  toppings?: any[]
}

interface MockOrderContext {
  ticketNumber: string
  referenceId: string
  locationId: string
  menuSlug: string
  timeZone: string
  email?: string
  phone?: string
  orderToken: string
}

export function mockSquareOrderFromCart(items: MockCartItem[], context: MockOrderContext) {
  const now = new Date().toISOString()
  const pickupAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const lineItems = items.map((item) => {
    const totalAmount = item.price * item.quantity

    return {
      uid: crypto.randomUUID(),
      name: item.name,
      quantity: String(item.quantity),
      basePriceMoney: {
        amount: item.price,
        currency: 'USD',
      },
      totalMoney: {
        amount: totalAmount,
        currency: 'USD',
      },
      variationName: item.variationName ?? 'Regular',
      itemType: 'ITEM',
      catalogObjectId: item.catalogItemId,
      metadata: {
        catalogItemId: item.catalogItemId,
        ...(item.metadata || {}),
      },
      note: item.note || '',
    }
  })

  const totalAmount = lineItems.reduce((sum, item) => {
    return sum + (item.totalMoney.amount || 0)
  }, 0)

  return {
    id: `demo-${crypto.randomUUID()}`,
    locationId: context.locationId,
    state: 'OPEN',
    createdAt: now,
    updatedAt: now,
    referenceId: context.referenceId,
    ticketName: context.ticketNumber,
    version: 1,
    source: {
      name: 'PrepEat.io',
    },
    metadata: {
      ticketNumber: context.ticketNumber,
      menuSlug: context.menuSlug,
      timeZone: context.timeZone,
      orderToken: context.orderToken,
    },
    fulfillments: [
      {
        uid: crypto.randomUUID(),
        type: 'PICKUP',
        state: 'PROPOSED',
        pickupDetails: {
          placedAt: now,
          pickupAt: pickupAt,
          acceptedAt: now,
          readyAt: now,
          recipient: {
            displayName: context.ticketNumber,
            emailAddress: context.email || '',
            phoneNumber: context.phone || '',
          },
          note: 'Customer will pick up at the counter.',
        },
      },
    ],
    lineItems,
    totalMoney: {
      amount: totalAmount,
      currency: 'USD',
    },
    netAmountDueMoney: {
      amount: 0,
      currency: 'USD',
    },
    tenders: [
      {
        id: `demo-${crypto.randomUUID()}`,
        type: 'OTHER',
        amountMoney: {
          amount: totalAmount,
          currency: 'USD',
        },
        createdAt: now,
        locationId: context.locationId,
        other_details: {
          source: 'Demo Checkout Bypass',
        },
        paymentId: `demo-${crypto.randomUUID()}`,
        transactionId: `demo-${crypto.randomUUID()}`,
      },
    ],
  }
}
