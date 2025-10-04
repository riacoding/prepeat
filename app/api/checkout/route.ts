import { NextRequest, NextResponse } from 'next/server'
import { cookieBasedClient } from '@/util/amplify'
import { SquareClient, SquareEnvironment } from 'square'
import { randomUUID } from 'crypto'
import { getMerchantSecretByArn, getServerMerchant, isAuth } from '@/lib/ssr-actions'

export async function POST(req: NextRequest) {
  //console.log('SQUARE_ACCESS_TOKEN length:', process.env.SQUARE_ACCESS_TOKEN?.length)
  const authMode = (await isAuth()) ? 'userPool' : 'iam'
  try {
    const body = await req.json()
    const { cartItems, locationId, menuSlug, orderToken, timeZone, backLink, merchantId } = body
    console.log('checkout route', JSON.stringify(body, null, 2))
    const merchant = await getServerMerchant(merchantId)

    if (!merchant?.secretsArn) {
      return NextResponse.json({ error: 'Unauthorized merchant' }, { status: 401 })
    }
    const secret = await getMerchantSecretByArn(merchant.secretsArn)

    const client = new SquareClient({
      token: secret.accessToken,
      environment: secret.squareEnv === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
      version: '2025-04-16',
    })

    if (!cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: 'No items in cart' }, { status: 400 })
    }

    const { data: ticket } = await cookieBasedClient.queries.getTicket(
      { locationId: locationId, timeZone: timeZone },
      { authMode }
    )

    const displayTicketNumber: string = ticket?.ticketNumber?.slice(-12) || ''

    if (menuSlug === 'demo') {
      return NextResponse.json({ url: 'demo', ticketNumber: ticket?.ticketNumber })
    }

    const lineItems = cartItems.map((item: any) => ({
      catalogObjectId: item.catalogVariationId,
      quantity: item.quantity.toString(),
      name: item.customName || item.name,
      note: 'user notes',
      basePriceMoney: {
        amount: BigInt(item.price), // Ensure this is the correct price in cents
        currency: 'USD',
      },
      metadata: {
        catalogItemId: item.id,
      },
      modifiers: item.toppings.map((t: any) => ({
        name: t.name,
        quantity: '1',
        basePriceMoney: {
          amount: BigInt(t.price),
          currency: 'USD',
        },
        catalogObjectId: t.id,
      })),
    }))

    // Then create checkout link using that order
    const result = await client.checkout.paymentLinks.create({
      idempotencyKey: randomUUID(),
      order: {
        locationId,
        referenceId: ticket?.ticketNumber,
        ticketName: displayTicketNumber,
        source: {
          name: 'PrepEat.io',
        },
        lineItems,
        taxes: [
          {
            uid: 'INOISXDO45PKAMHRTDQ4MQVI',
            scope: 'ORDER',
            name: 'State Sales Tax',
            percentage: '8.25',
          },
        ],
        fulfillments: [
          {
            type: 'PICKUP',
            state: 'PROPOSED',
            pickupDetails: {
              recipient: {
                displayName: ticket?.ticketNumber?.slice(-12),
                phoneNumber: '+15555555555',
                emailAddress: 'test@test.com',
              },
              note: 'Customer will pick up at the counter.',
              pickupAt: new Date(Date.now() + 15 * 60000).toISOString(), // 15 mins from now
            },
          },
        ],
        metadata: {
          menuSlug: menuSlug ?? 'no slug',
          ticketNumber: displayTicketNumber,
          orderToken: orderToken,
          timeZone: timeZone,
        },
      },
      checkoutOptions: {
        redirectUrl: `${process.env.NEXT_PUBLIC_BASE_URL}${backLink}/thankyou?order=${ticket?.ticketNumber}`,
        allowTipping: true,
      },
    })

    return NextResponse.json({ url: result.paymentLink?.longUrl, ticketNumber: ticket?.ticketNumber })
  } catch (err) {
    console.error('Error creating Square checkout:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
