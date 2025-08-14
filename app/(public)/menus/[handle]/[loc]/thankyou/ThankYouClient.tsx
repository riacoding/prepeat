'use client'

import { useCart } from '@/components/CartContext'
import { ReceiptSimpleList } from '@/components/ReceiptItemList'
import { getSquareOrderByOrderNumber, updateOrderContact } from '@/lib/ssr-actions'
import { OrderReceipt, ReceiptItem, SecureReceipt } from '@/types'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { useOrderUpdateSubscription } from '@/hooks/useOrderUpdateSubscription'

const client = generateClient<Schema>()

export default function ThankYouClient() {
  const searchParams = useSearchParams()
  const [order, setOrder] = useState<OrderReceipt | null>(null)
  const [name, setName] = useState('')
  const [orderStatus, setOrderStatus] = useState('PROPOSED')
  const [rawPhone, setRawPhone] = useState('')
  const formattedPhone = formatPhoneInput(rawPhone)
  const [submitted, setSubmitted] = useState(false)
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(true)
  const orderAccess = searchParams.get('order') || 'none-none'
  const isDemo = searchParams.get('isDemo')
  const [locationId, date, orderNumber] = orderAccess.split('-')
  const { clearCart } = useCart()

  console.log('isDemo', '456', isDemo)

  useOrderUpdateSubscription(order?.id, Boolean(isDemo), (status) => {
    setOrderStatus(status)
  })

  useEffect(() => {
    clearCart()
  }, [])

  useEffect(() => {
    async function fetchOrder() {
      const orderToken = localStorage.getItem(orderAccess)
      console.log('orderToken:', '123', orderToken)
      if (orderToken) {
        const res = await getSquareOrderByOrderNumber(orderAccess, orderToken, Boolean(isDemo))
        setOrder(res)
        localStorage.removeItem(orderAccess)
      }

      setIsLoading(false)
    }

    fetchOrder()
  }, [])

  const handleContactSubmit = async () => {
    console.log('updating order contact for SMS', orderAccess, rawPhone)
    await updateOrderContact(normalizePhoneForStorage(rawPhone), orderAccess, Boolean(isDemo))
    setSubmitted(true)
  }

  // Format as (555) 555-5555 while typing
  function formatPhoneInput(raw: string): string {
    const cleaned = raw.replace(/\D/g, '').slice(0, 10)
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/)

    if (!match) return cleaned

    const [, area, prefix, line] = match
    if (line) return `(${area}) ${prefix}-${line}`
    if (prefix) return `(${area}) ${prefix}`
    if (area) return `(${area}`
    return ''
  }

  // Normalize to +15555555555 on submit
  function normalizePhoneForStorage(formatted: string): string {
    const digits = formatted.replace(/\D/g, '')
    return `+1${digits.slice(0, 10)}`
  }

  return (
    <div className='w-full flex flex-col  items-center justify-center'>
      <div className='w-full max-w-md flex flex-col items-center justify-center bg-gray-100 p-4'>
        <div className='w-full border-4 border-black rounded-md p-8 text-center bg-white shadow-md'>
          <h1 className='text-3xl font-bold mb-4'>Thank you</h1>

          <p className='text-lg'>Your {isDemo ? 'Demo' : ''} order number is:</p>
          <p className='text-3xl font-semibold mt-2 min-h-[2.5rem] break-words'>{orderNumber || '\u00A0'}</p>

          <div className='mt-4 min-h-[8rem]'>
            {isLoading && <p className='text-lg'>Loading order...</p>}
            {order && order.receiptItems.length > 0 && <ReceiptSimpleList items={order.receiptItems} />}
          </div>
          <div className='mt-4'>
            {orderStatus === 'PREPARED' ? (
              <p className='text-lg text-green-500'>Your order is ready! Pick it up and Enjoy </p>
            ) : (
              <p className='text-md'>Leave this window open and we'll let you know when its ready </p>
            )}
          </div>
        </div>
        <div>
          {!submitted && (
            <div className='mt-6 text-left space-y-3'>
              <h2 className='text-lg font-semibold'>Want a text when your order is ready?</h2>
              <Input placeholder='Phone number' value={formattedPhone} onChange={(e) => setRawPhone(e.target.value)} />
              <Button onClick={handleContactSubmit} className='mt-2' disabled={!rawPhone}>
                Submit Info
              </Button>
            </div>
          )}

          {submitted && <p className='mt-6 text-green-600'>✅ You’ll get a text when it’s ready!</p>}
        </div>
      </div>
    </div>
  )
}
