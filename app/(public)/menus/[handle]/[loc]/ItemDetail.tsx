'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useCart } from '@/components/CartContext'
import { Button } from '@/components/ui/button'
import { Minus, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useMenu } from './MenuProvider'
import { CartItem, ModifierAmplify, ModifierListAmplify, NormalizedItem, NormalizedModifier } from '@/types'
import { usePublicMerchant } from '@/components/MerchantPublicContext'
import { formatCurrencyCents } from '@/lib/moneyFormat'

type Topping = {
  id: string
  name: string
  price: number
  groupName: string
}

export default function ItemDetail({ item, handle }: { item: NormalizedItem; handle: string }) {
  const { addItem } = useCart()
  const { location } = useMenu()
  const { merchant } = usePublicMerchant()
  const router = useRouter()
  const [quantity, setQuantity] = useState(1)
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const defaults: Record<string, boolean> = {}
    item.modifierLists?.forEach((t) => {
      t.modifiers?.forEach((m) => {
        defaults[m.modifierId] = false // or true if you later support default toppings
      })
    })
    setSelectedModifiers(defaults)
  }, [item])

  const toggleTopping = (id: string) => {
    setSelectedModifiers((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const calculateTotal = () => {
    let toppingTotal = 0
    item.modifierLists?.forEach((list) => {
      toppingTotal += list.modifiers?.reduce((sum: number, m: ModifierAmplify) => {
        return selectedModifiers[m.modifierId] ? sum + m.priceCents : sum
      }, 0)
    })

    return ((Number(item.price) + toppingTotal) * quantity) / 100
  }

  const handleAddToCart = () => {
    const selected = item.modifierLists.flatMap((list) => {
      return list.modifiers.filter((t: ModifierAmplify) => selectedModifiers[t.modifierId])
    })
    const cartItem: Omit<CartItem, 'lineId'> = {
      ...item,
      quantity,
      modifiers: selected,
    }
    console.log('adding item to cart:', cartItem)
    addItem(cartItem)
    router.push(`/menus/${handle}/${location}/cart`)
  }

  return (
    <div className='p-4 max-w-md mx-auto space-y-4'>
      <header className='sticky top-0 bg-white z-10'>
        <div className='flex items-center p-4'>
          <Link data-testid='back-button' href={`/menus/${handle}/${location}`} className='mr-4'>
            <ChevronLeft className='h-6 w-6' />
          </Link>
          <h1 className='text-xl font-bold'>Add To Order</h1>
        </div>
      </header>
      <h1 data-testid='item-name' className='text-2xl font-bold'>
        {item.customName || item.name}
      </h1>
      {merchant?.displayImages && (
        <div className='w-16 h-16 relative mr-3'>
          {item && item.image && (
            <Image src={item.image} alt={item.name} fill className='object-cover rounded border' />
          )}
        </div>
      )}
      <p className='text-muted-foreground'>{item.description}</p>
      <p className='font-semibold text-lg'>${(item.price / 100).toFixed(2)}</p>

      {/* Toppings/Modifiers */}
      {Boolean(item?.modifierLists?.length) && (
        <>
          {(item.modifierLists as ModifierListAmplify[]).map((list) => (
            <fieldset key={list.modifierListId ?? list.name} className='mt-6'>
              <h2 className='font-semibold mb-2'>{list.name}</h2>
              <ul className='space-y-2'>
                {list.modifiers?.map((m) => {
                  const inputId = `mod-${m.modifierId}`
                  return (
                    <li key={m.modifierId} className='flex justify-between items-center'>
                      <label htmlFor={inputId} className='flex gap-2 items-center'>
                        <input
                          id={inputId}
                          type='checkbox'
                          checked={!!selectedModifiers[m.modifierId]}
                          onChange={() => toggleTopping(m.modifierId)}
                        />
                        <span>{m.name}</span>
                      </label>

                      {m.priceCents > 0 && (
                        <span className='text-sm text-gray-500'>
                          +{formatCurrencyCents(m.priceCents, 'en-US', m.currency)}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          ))}
        </>
      )}

      {/* Quantity */}
      <div className='flex items-center gap-4 mt-4'>
        <Button variant='outline' size='icon' onClick={() => setQuantity(Math.max(1, quantity - 1))}>
          <Minus className='w-4 h-4' />
        </Button>
        <span className='text-xl font-medium'>{quantity}</span>
        <Button variant='outline' size='icon' onClick={() => setQuantity(quantity + 1)}>
          <Plus className='w-4 h-4' />
        </Button>
      </div>

      {/* Total & Add */}
      <div className='flex justify-between items-center pt-4'>
        <span className='text-lg font-medium'>Total:</span>
        <span className='text-xl font-bold'>${calculateTotal().toFixed(2)}</span>
      </div>

      <Button data-testid='add-to-cart' className='w-full' onClick={handleAddToCart}>
        Add to Cart
      </Button>
    </div>
  )
}
