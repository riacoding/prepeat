// app/api/square/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookieBasedClient } from '@/util/amplify'

const env = process.env

export async function POST(req: NextRequest) {
  const body = await req.json()
  const merchantId = body.merchantId

  if (!merchantId) {
    return NextResponse.json({ error: 'Missing merchantId' }, { status: 400 })
  }

  try {
    //   codeHash: a.string().required(), // sha256(normalizedCode + PEPPER)
    //         merchantId: a.string().required(),
    //         status: CodeStatus,
    //         expiresAt: a.integer(),
    //         maxUses: a.integer().default(1),
    //         usedCount: a.integer().default(0),
    //         reservedAt: a.datetime(),
    //         usedAt: a.datetime(),
    //         createdBy: a.string(),

    // const { data: merchant } = await cookieBasedClient.models.EnrollmentCode.create({
    //       merchantId })

    return NextResponse.json({
      success: true,
    })
  } catch (err) {
    console.error('Device Code error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
