// app/api/_debug/menu/route.ts
import { NextResponse } from 'next/server'
import { fetchMenuWithItems } from '@/lib/fetchMenuWithItems' // adjust path

// For a debug endpoint, force dynamic so each request actually runs.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const loc = searchParams.get('loc') ?? 'bar'

  console.time(`menu x3:${loc}`)
  // Concurrent calls: proves dedupe; you should see your [FETCH MENU] log once.
  const [a, b, c] = await Promise.all([fetchMenuWithItems(loc), fetchMenuWithItems(loc), fetchMenuWithItems(loc)])
  console.timeEnd(`menu x3:${loc}`)

  return NextResponse.json({
    loc,
    itemsCounts: [a.items.length, b.items.length, c.items.length],
  })
}
