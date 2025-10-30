import { NextRequest, NextResponse } from 'next/server'
import { SquareClient, SquareEnvironment, Square } from 'square'
import { cookieBasedClient } from '@/util/amplify'
import jwt from 'jsonwebtoken'
import { getAppSecret, upsertMerchantSecret } from './secrets-upsert'
import { timingSafeEqual } from 'node:crypto' // <-- Node crypto
import { Buffer } from 'node:buffer'

export const runtime = 'nodejs'

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

const env = process.env

export async function GET(req: NextRequest) {
  console.log('request', req)
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const queryState = url.searchParams.get('state') ?? ''
  const cookieState = req.cookies.get('oauth_state')?.value ?? ''

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 })
  }

  // Byte-for-byte comparison
  const match = queryState && cookieState && timingSafeEqualStr(queryState, cookieState)
  if (!match) {
    // optional: clear the cookie on failure
    const res = NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/onboarding/error`)
    res.cookies.delete('oauth_state')
    return res
  }

  let prepEatMerchantId: string

  try {
    const decoded = jwt.verify(queryState!, env.OAUTH_STATE_SECRET!) as { merchantId: string }
    prepEatMerchantId = decoded.merchantId
  } catch (err) {
    console.error('Invalid or expired state token:', err)
    return NextResponse.redirect(`${env.NEXT_PUBLIC_BASE_URL}/onboarding/error`)
  }

  try {
    const square = new SquareClient({
      environment: env.SQUARE_ENV === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
      token: undefined, // We're obtaining one now
    })

    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/square/callback`
    console.log('redirectUri', redirectUri)

    console.log('Debug:env', env.ENVIRONMENT)
    const appSecret = await getAppSecret(env.ENVIRONMENT!)

    if (!appSecret) {
      console.error('Missing app secret')
      return NextResponse.redirect(`${env.NEXT_PUBLIC_BASE_URL}/onboarding/error`)
    }

    const tokenResult: Square.ObtainTokenResponse = await square.oAuth.obtainToken({
      code,
      clientId: env.SQUARE_APPLICATION_ID!,
      clientSecret: appSecret.clientSecret,
      grantType: 'authorization_code',
      redirectUri: redirectUri,
    })

    const { accessToken, refreshToken, expiresAt, merchantId } = tokenResult

    const authedSquare = new SquareClient({
      environment: SquareEnvironment.Sandbox,
      token: accessToken!,
    })

    const merchantProfile: Square.GetMerchantResponse = await authedSquare.merchants.get({ merchantId: merchantId! })

    const locationsResponse: Square.ListLocationsResponse = await authedSquare.locations.list()
    const activeLocations = locationsResponse.locations?.filter((loc) => loc.status === 'ACTIVE') ?? []

    const locationIds = activeLocations.map((loc) => loc.id!)
    console.log('Fetched location IDs:', locationIds)

    if (!accessToken || !merchantId) {
      console.error('Missing access token or refresh token or merchant ID')
      return NextResponse.redirect(`${env.NEXT_PUBLIC_BASE_URL}/onboarding/error`)
    }

    // Set tokens in secrets Manager
    const secretARN = await upsertMerchantSecret(
      {
        merchantId: prepEatMerchantId,
        squareMerchantId: merchantId,
        accessToken: accessToken,
        refreshToken: refreshToken,
        squareEnv: env.SQUARE_ENV === 'production' ? 'production' : 'sandbox',
        updatedAt: new Date().toISOString(),
      },
      env.ENVIRONMENT!
    )

    await cookieBasedClient.models.Merchant.update({
      id: prepEatMerchantId,
      secretsArn: secretARN,
      tokenExpiresAt: expiresAt,
      tokenRefreshedAt: new Date().toISOString(),
      squareMerchantId: merchantId,
      businessName: merchantProfile.merchant?.businessName || 'Unnamed Business',
      locationIds: locationIds || [],
      isLinked: true,
    })

    const res = NextResponse.redirect(`${env.NEXT_PUBLIC_BASE_URL}/admin/setup`)
    res.cookies.delete('oauth_state') // clears Path=/ cookie
    //res.cookies.set('oauth_state', '', { path: '/', maxAge: 0 })   optionally clear it
    return res
  } catch (err: any) {
    console.error('OAuth callback error', err)
    return NextResponse.redirect(`${env.NEXT_PUBLIC_BASE_URL}/onboarding/error`)
  }
}
