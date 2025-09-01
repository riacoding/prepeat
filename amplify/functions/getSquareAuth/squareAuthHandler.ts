import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { env } from '$amplify/env/squareAuthHandler'

const SQUARE_ENV = process.env.SQUARE_ENV || 'sandbox'
const SQUARE_APPLICATION_ID = process.env.SQUARE_APPLICATION_ID!

export const handler = async (event: any) => {
  console.log('getSquareAuth event', event)
  console.log('debug env', process.env.OAUTH_STATE_SECRET, process.env.SQUARE_APPLICATION_ID, process.env.APP_BASE_URL)

  const merchantId = event.arguments.merchantId as string

  // Generate a jwt token
  const state = jwt.sign(
    {
      merchantId,
      nonce: crypto.randomBytes(32).toString('hex'),
    },
    process.env.OAUTH_STATE_SECRET!,
    { expiresIn: '1h' }
  )

  // Store this state in your DB or pass it back to client to set in cookie
  // (e.g., state -> handle map in DynamoDB with TTL)

  const isSandbox = SQUARE_ENV.toLowerCase() === 'sandbox' || SQUARE_ENV.toLowerCase() === 'staging'
  const basePath = isSandbox ? 'https://app.squareupsandbox.com' : 'https://app.squareup.com'

  const redirectUri = `${env.APP_BASE_URL}/square/callback` // replace with your actual sandbox callback

  console.log('redirectURI', redirectUri)

  const scopes = [
    'MERCHANT_PROFILE_READ',
    'MERCHANT_PROFILE_WRITE',
    'ITEMS_READ',
    'ITEMS_WRITE',
    'ORDERS_READ',
    'ORDERS_WRITE',
    'PAYMENTS_READ',
    'PAYMENTS_WRITE',
  ]

  const url =
    `${basePath}/oauth2/authorize` +
    `?client_id=${SQUARE_APPLICATION_ID}` +
    `&response_type=code` +
    `&scope=${scopes.join('+')}` +
    `&state=${state}` +
    `&redirect_uri=${redirectUri}`

  return {
    url,
    state,
  }
}
