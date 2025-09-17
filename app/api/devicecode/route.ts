// app/api/square/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookieBasedClient } from '@/util/amplify'
import type { CodeStatus } from '@/types'
import { expiresAt, generateCode } from '@/lib/utils'

const env = process.env

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { merchantId, createdBy } = body

  if (!merchantId) {
    return NextResponse.json({ error: 'Missing merchantId' }, { status: 400 })
  }

  if (!createdBy || createdBy === '') {
    return NextResponse.json({ error: 'Missing createdBy' }, { status: 400 })
  }
  const expiry = new Date(expiresAt(new Date(), 15)).getTime()

  try {
    const { data: deviceCode, errors } = await cookieBasedClient.models.EnrollmentCode.create({
      codeHash: generateCode(),
      merchantId,
      status: 'RESERVED' as CodeStatus,
      reservedAt: new Date().toISOString(),
      expiresAt: expiresAt(Date.now(), 15),
      createdBy,
    })

    if (errors?.length) {
      console.error('create device code errors:', errors)

      throw new Error(errors.map((e) => e.message).join('; '))
    }

    if (!deviceCode?.codeHash || !merchantId || !deviceCode.createdAt) {
      return NextResponse.json({ error: 'Error fetching device code' }, { status: 400 })
    }

    return NextResponse.json({
      codeHash: deviceCode.codeHash,
      merchantId,
      expiresAt: deviceCode.expiresAt,
    })
  } catch (err) {
    console.error('Device Code error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
