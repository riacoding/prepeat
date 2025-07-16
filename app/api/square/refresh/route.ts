// app/api/square/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookieBasedClient } from '@/util/amplify'

const env = process.env

export async function POST(req: NextRequest) {
  const body = await req.json()
  const merchantId = body.merchantId

  console.log('tokens', process.env.SQUARE_APPLICATION_ID, process.env.SQUARE_CLIENT_SECRET, env.SQUARE_ACCESS_TOKEN)

  if (!merchantId) {
    return NextResponse.json({ error: 'Missing merchantId' }, { status: 400 })
  }

  try {
    const { data: merchant } = await cookieBasedClient.models.Merchant.get({ id: merchantId })

    console.log('merchant refresh', merchant?.refreshToken)

    if (!merchant || !merchant.refreshToken) {
      return NextResponse.json({ error: 'Merchant not found or missing refresh token' }, { status: 404 })
    }

    const tokenRes = await fetch('https://connect.squareupsandbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        client_id: env.SQUARE_APPLICATION_ID,
        client_secret: env.SQUARE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: merchant.refreshToken,
      }),
    })

    if (!tokenRes.ok) {
      const error = await tokenRes.json()
      console.error('Square token refresh failed:', error)
      return NextResponse.json({ error }, { status: 500 })
    }

    const { access_token, refresh_token, expires_at } = await tokenRes.json()

    await cookieBasedClient.models.Merchant.update({
      id: merchantId,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt: expires_at,
      tokenrefreshedAt: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      accessTokenEnds: expires_at,
    })
  } catch (err) {
    console.error('Refresh error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
