'use client'

import { useRouter } from 'next/navigation'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '@/components/CartContext' // adjust path if needed
import { useEffect, useState } from 'react'
import { usePublicMerchant } from './MerchantPublicContext'
import { useMenu } from '@/app/(public)/menus/[handle]/[loc]/MenuProvider'

export default function CartIcon() {
  const [itemCount, setItemCount] = useState(0)
  const router = useRouter()
  const { items } = useCart()
  const { merchant } = usePublicMerchant()
  const { menu } = useMenu()

  useEffect(() => {
    const count = items.reduce((total, item) => total + item.quantity, 0)
    setItemCount(count)
  }, [items])

  return (
    <div className='relative flex items-center'>
      <button
        onClick={() => router.push(`/menus/${merchant?.handle}/${menu.locationId}/cart`)}
        aria-label='Cart'
        className='hover:text-gray-600 transition'
      >
        <ShoppingCart className='w-8 h-8' />
      </button>
      {itemCount > 0 && (
        <span
          data-testid='cart-badge'
          className='absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center'
        >
          {itemCount}
        </span>
      )}
    </div>
  )
}
