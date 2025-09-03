'use client'
import { Order } from '@/types'
import React, { useMemo } from 'react'

type AllDayListProps = {
  orders: Order[] // from useDemoOrders()
}

type Bucket = {
  key: string
  qty: number
  name: string
  variation?: string
  mods: string[]
}

function toNum(n: unknown, fallback = 0) {
  const v = typeof n === 'string' ? parseFloat(n) : typeof n === 'number' ? n : NaN
  return Number.isFinite(v) ? v : fallback
}

function normModifierKey(mods?: Array<{ name?: string; quantity?: number | string }>) {
  if (!mods?.length) return [] as string[]
  // sort modifiers for stable grouping
  return mods.map((m) => `${(m.name || '').trim()}×${toNum(m.quantity ?? 1, 1)}`).sort((a, b) => a.localeCompare(b))
}

function makeKey(name: string, variation?: string, mods?: string[]) {
  const core = `${name}||${variation || ''}`
  const modStr = mods && mods.length ? mods.join('+') : ''
  return `${core}||${modStr}`
}

export default function AllDayList({ orders }: AllDayListProps) {
  const rows = useMemo(() => {
    const buckets = new Map<string, Bucket>()

    for (const o of orders) {
      if (o.fulfillmentStatus !== 'PROPOSED') continue
      const items = o.rawData?.lineItems ?? []
      for (const li of items) {
        const name = (li.name || '').trim()
        if (!name) continue

        const qty = toNum(li.quantity ?? 1, 1)
        const variation = li.variationName?.trim() || undefined
        const mods = normModifierKey(li.modifiers)
        const key = makeKey(name, variation, mods)

        const existing = buckets.get(key)
        if (existing) {
          existing.qty += qty
        } else {
          buckets.set(key, { key, qty, name, variation, mods })
        }
      }
    }

    // sort: qty desc, then alphabetical
    return [...buckets.values()].sort((a, b) => {
      if (b.qty !== a.qty) return b.qty - a.qty
      return a.key.localeCompare(b.key)
    })
  }, [orders])

  return (
    <div className='h-full flex flex-col'>
      <div className='px-4 py-2 border-b'>
        <h2 className='text-lg font-semibold'>All Day — Totals by Item</h2>
        <p className='text-xs text-muted-foreground'>Aggregated QTY for all in-progress orders.</p>
      </div>

      <div className='flex-1 overflow-y-auto'>
        <ul className='divide-y'>
          {rows.map((r) => (
            <li key={r.key} className='flex items-center gap-3 px-4 py-3'>
              {/* QTY pill */}
              <div className='shrink-0 min-w-12 h-10 px-2 flex items-center justify-center rounded-lg border font-semibold'>
                ×{r.qty}
              </div>

              {/* Label */}
              <div className='min-w-0'>
                <div className='flex flex-wrap items-baseline gap-x-2'>
                  <span className='font-medium text-base'>{r.name}</span>
                  {r.variation && <span className='text-xs italic text-muted-foreground'>{r.variation}</span>}
                </div>

                {/* modifiers as chips */}
                {r.mods.length > 0 && (
                  <div className='mt-1 flex flex-wrap gap-1.5'>
                    {r.mods.map((m) => (
                      <span key={m} className='text-xs px-2 py-0.5 rounded-full bg-muted'>
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}

          {rows.length === 0 && <li className='px-4 py-6 text-sm text-muted-foreground'>No in-progress orders.</li>}
        </ul>
      </div>
    </div>
  )
}
