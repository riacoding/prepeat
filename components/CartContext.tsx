'use client'

import { CartItem, NormalizedTopping } from '@/types'
import React, { createContext, useContext, useEffect, useState } from 'react'

type CartContextType = {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (id: string) => void
  clearCart: () => void
  getTotal: () => number
  getTotalItems: () => number
  menuSlug: string | null
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('cartItems')
      if (stored) {
        try {
          return JSON.parse(stored)
        } catch (e) {
          console.error('Failed to parse stored cart items:', e)
        }
      }
    }
    return []
  })

  const [menuSlug, setMenuSlug] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('lastMenuLoc')
      if (stored) {
        try {
          return stored
        } catch (e) {
          console.error('Failed to parse stored menu slug:', e)
        }
      }
    } else {
      console.log('lastMenuLoc is undefined')
    }
    return null
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cartItems', JSON.stringify(items))
    }
  }, [items])

  const toppingsMatch = (a: NormalizedTopping[], b: NormalizedTopping[]) => {
    if (a.length !== b.length) return false
    const idsA = a.map((t) => t.id).sort()
    const idsB = b.map((t) => t.id).sort()
    return idsA.every((id, idx) => id === idsB[idx])
  }

  const addItem = (item: CartItem) => {
    const existingIndex = items.findIndex((i) => i.id === item.id && toppingsMatch(i.toppings, item.toppings))

    if (existingIndex !== -1) {
      const updated = [...items]
      updated[existingIndex].quantity += item.quantity
      setItems(updated)
    } else {
      setItems([...items, item])
    }
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const clearCart = () => {
    localStorage.removeItem('cartItems')
    setItems([])
  }

  const getTotal = () =>
    items.reduce((sum, item) => {
      const toppingsTotal = item.toppings.reduce((tSum, t) => tSum + t.price, 0)
      return sum + (item.price + toppingsTotal) * item.quantity
    }, 0)

  const getTotalItems = () =>
    items.reduce((sum, item) => {
      return sum + item.quantity
    }, 0)

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, getTotal, getTotalItems, menuSlug }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider')
  return context
}
