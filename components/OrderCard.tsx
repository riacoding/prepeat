import useOrderAge from '@/hooks/useOrderAge'
import React from 'react'
import { Card, CardContent } from './ui/card'
import { cn } from '@/lib/utils'
import { Order } from '@/app/(prepeat)/admin/kds/page'
import { Button } from './ui/button'
import OrderTimer from './OrderTimer'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'

type Props = {
  order: Order
  newOrderIds: Set<string>
  handlePrepared: (order: Order) => void
}

export default function OrderCard({ order, newOrderIds, handlePrepared }: Props) {
  const age = useOrderAge(order.createdAt ?? '')
  const raw = order.rawData
  const ticket = raw?.metadata?.ticketNumber ?? order.referenceId
  const createdAt = raw?.createdAt ? new Date(raw.createdAt) : undefined
  const lineItems = raw?.lineItems ?? []
  const fulfillment = raw?.fulfillments?.[0]?.pickupDetails
  const recipient = fulfillment?.recipient
  const pickupAt = fulfillment?.pickupAt ? new Date(fulfillment.pickupAt) : undefined

  const statusLevel: 'normal' | 'warning' | 'urgent' = age < 300 ? 'normal' : age < 600 ? 'warning' : 'urgent'

  return (
    <Card
      className={cn(
        'transition-all border-4 h-full flex flex-col',
        newOrderIds.has(order.id) && 'border-blue-500 animate-pulse'
      )}
      data-testid='order-card'
    >
      <CardContent className='p-4 flex flex-col flex-1'>
        {/* Header: Age / Ticket / Meta */}
        <div className='mb-5 flex md:flex-row flex-col items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <span className='text-xs text-muted-foreground'>Time since order:</span>
            {raw?.createdAt && <OrderTimer createdAt={raw.createdAt} statusLevel={statusLevel} />}
          </div>
          <div className='flex items-center gap-2'>
            {order.status && (
              <Badge className='capitalize' variant='secondary'>
                {order.status}
              </Badge>
            )}
            {pickupAt && (
              <Badge variant='outline' className='font-mono'>
                Pickup {format(pickupAt, 'p')}
              </Badge>
            )}
          </div>
        </div>

        {/* Ticket + When/Who */}
        <div className='mb-5 flex items-baseline justify-between'>
          <h2 className='text-2xl font-bold tracking-tight' data-testid='ticket-number'>
            Ticket #{ticket?.slice(-3)}
          </h2>
          <div className=' hidden md:block text-right'>
            <p className='text-xs text-muted-foreground'>{createdAt ? format(createdAt, 'PPpp') : '—'}</p>
            {recipient?.displayName && <p className='text-sm mt-0.5'>Customer: {recipient.displayName}</p>}
          </div>
        </div>

        <div className='h-px bg-muted/60' />

        {/* Items */}
        <ul className='space-y-3' data-testid='order-items'>
          {lineItems.map((item: any, idx: number) => {
            const qty = Number(item.quantity ?? 1)
            return (
              <li key={idx} className='flex gap-3'>
                {/* Quantity pill */}
                <div className='flex items-center gap-5'>
                  <div
                    className={cn(
                      'shrink-0 flex items-center justify-center rounded-lg border px-2 min-w-10 h-10 text-base font-semibold',
                      statusLevel === 'warning' && 'border-yellow-500',
                      statusLevel === 'urgent' && 'border-red-600'
                    )}
                    aria-label={`Quantity ${qty}`}
                  >
                    ×{qty}
                  </div>

                  {/* Item details */}
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <span className='font-semibold text-base truncate'>{item.name}</span>
                      {item.variationName && (
                        <span className='text-xs italic text-muted-foreground'>{item.variationName}</span>
                      )}
                    </div>
                  </div>

                  {/* Modifiers as chips */}
                  {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                    <div className='mt-1 flex flex-wrap gap-1.5' data-testid='modifiers'>
                      {item.modifiers.map((mod: any, i: number) => (
                        <span key={i} className='text-xs px-2 py-0.5 rounded-full bg-muted'>
                          {mod.name}
                          {mod.quantity ? ` × ${mod.quantity}` : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {item.note && (
                    <div
                      className={cn(
                        'mt-1 text-sm rounded-md px-2 py-1',
                        'bg-amber-50 text-amber-900 border border-amber-200'
                      )}
                      data-testid='item-note'
                    >
                      Note: {item.note}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className='flex-1'></div>

        {/* Action */}
        <div className='pt-2 mt-auto'>
          <Button
            onClick={() => handlePrepared(order)}
            className={cn(
              'w-full mt-2 text-lg py-6 rounded-xl',
              statusLevel === 'warning' && 'bg-yellow-500 hover:bg-yellow-600',
              statusLevel === 'urgent' && 'bg-red-600 hover:bg-red-700 animate-pulse'
            )}
            data-testid='prepared-button'
          >
            Prepared
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
