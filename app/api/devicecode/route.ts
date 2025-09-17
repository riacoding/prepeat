// app/api/devicecode/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookieBasedClient } from '@/util/amplify'
import type { CodeStatus, RequestCodeResponse } from '@/types'
import { expiresAt, generateCode } from '@/lib/utils'

const nowSec = () => Math.floor(Date.now() / 1000)
const hasExpired = (expSeconds: number) => nowSec() > expSeconds

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const merchantId = searchParams.get('merchantId')

  if (!merchantId) {
    return NextResponse.json({ error: 'Missing merchantId' }, { status: 400 })
  }

  try {
    const rs = await cookieBasedClient.models.EnrollmentCode.listEnrollmentCodeByMerchantId(
      { merchantId },
      { limit: 5, filter: { status: { eq: 'RESERVED' } } }
    )

    const sorted = (rs?.data ?? []).sort((a, b) => {
      const ta = new Date(a.createdAt ?? 0).getTime()
      const tb = new Date(b.createdAt ?? 0).getTime()
      return tb - ta
    })

    const active = sorted.find((row) => {
      if (row.status !== ('RESERVED' as CodeStatus)) return false
      const exp = typeof row.expiresAt === 'number' ? row.expiresAt : Number(row.expiresAt)
      if (!Number.isFinite(exp)) return false
      return !hasExpired(exp)
    })

    if (!active?.codeHash || active.expiresAt == null) {
      return NextResponse.json({ error: 'No active code' }, { status: 404 })
    }

    const exp = typeof active.expiresAt === 'number' ? active.expiresAt : Number(active.expiresAt)

    return NextResponse.json<RequestCodeResponse>({
      codeHash: active.codeHash,
      merchantId,
      expiresAt: exp,
      codeType: 'EXISTING',
    })
  } catch (err) {
    console.error('GET /devicecode error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { merchantId, createdBy } = body ?? {}

  if (!merchantId || typeof merchantId !== 'string') {
    return NextResponse.json({ error: 'Missing merchantId' }, { status: 400 })
  }
  if (!createdBy || typeof createdBy !== 'string' || createdBy === '') {
    return NextResponse.json({ error: 'Missing createdBy' }, { status: 400 })
  }

  try {
    // 1) Try to reuse an existing non-expired RESERVED code
    const existing = await cookieBasedClient.models.EnrollmentCode.listEnrollmentCodeByMerchantId(
      { merchantId },
      { limit: 5, filter: { status: { eq: 'RESERVED' } } }
    )

    if (existing?.data?.length) {
      // prefer the freshest by createdAt
      const sorted = [...existing.data].sort((a, b) => {
        const ta = new Date(a.createdAt ?? 0).getTime()
        const tb = new Date(b.createdAt ?? 0).getTime()
        return tb - ta
      })

      const active = sorted.find((row) => {
        if (row.status !== ('RESERVED' as CodeStatus)) return false
        if (row.expiresAt == null) return false
        const exp = typeof row.expiresAt === 'number' ? row.expiresAt : Number(row.expiresAt)
        if (!Number.isFinite(exp)) return false
        return !hasExpired(exp)
      })

      if (active?.codeHash && active.expiresAt != null) {
        const exp = typeof active.expiresAt === 'number' ? active.expiresAt : Number(active.expiresAt)
        return NextResponse.json<RequestCodeResponse>({
          codeHash: active.codeHash,
          merchantId,
          expiresAt: exp, // integer seconds
          codeType: 'EXISTING',
        })
      }
    }

    // 2) No valid code → create a new one (15 minutes)
    const expSec = expiresAt(nowSec(), 15) as number // your util returns same unit as input
    const { data: deviceCode, errors } = await cookieBasedClient.models.EnrollmentCode.create({
      codeHash: generateCode(),
      merchantId,
      status: 'RESERVED' as CodeStatus,
      reservedAt: new Date().toISOString(), // keep ISO for timestamp fields
      expiresAt: expSec, // integer seconds
      createdBy,
    })

    if (errors?.length) {
      console.error('create device code errors:', errors)
      throw new Error(errors.map((e) => e.message).join('; '))
    }

    if (!deviceCode?.codeHash || deviceCode.expiresAt == null) {
      return NextResponse.json({ error: 'Error creating device code' }, { status: 500 })
    }

    return NextResponse.json<RequestCodeResponse>(
      {
        codeHash: deviceCode.codeHash,
        merchantId,
        expiresAt: typeof deviceCode.expiresAt === 'number' ? deviceCode.expiresAt : Number(deviceCode.expiresAt),
        codeType: 'NEW',
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('Device Code error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
