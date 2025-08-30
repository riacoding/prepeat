'use client'

import { useMenu } from '@/app/(public)/menus/[handle]/[loc]/MenuProvider'
import { CartItem, NormalizedTopping } from '@/types'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

type CartContextType = {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (id: string) => void
  clearCart: () => void
  getTotal: () => number
  getTotalItems: () => number
  menuSlug: string | null
}

type CartProviderProps = {
  children: React.ReactNode
  handle?: string | null // optional for namespacing
  location?: string | null // optional for namespacing + menuSlug
  namespace?: string // explicit namespace (e.g., 'admin')
}

const CartContext = createContext<CartContextType | undefined>(undefined)

function buildKey(handle?: string | null, location?: string | null, namespace?: string) {
  if (namespace) return `cartItems:${namespace}`
  if (handle && location) return `cartItems:${handle}:${location}`
  return 'cartItems'
}

export const CartProvider: React.FC<CartProviderProps> = ({ children, handle, location, namespace }) => {
  const storageKey = useMemo(() => buildKey(handle ?? null, location ?? null, namespace), [handle, location, namespace])

  const loadItems = () => {
    if (typeof window === 'undefined') return []
    // exact namespaced key first
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      try {
        return JSON.parse(raw) as CartItem[]
      } catch {}
    }
    // one-time legacy migration from 'cartItems' if it matches current location
    const legacy = localStorage.getItem('cartItems')
    const lastMenuLoc = localStorage.getItem('lastMenuLoc')
    if (legacy && location && lastMenuLoc === location) {
      try {
        const parsed = JSON.parse(legacy) as CartItem[]
        localStorage.setItem(storageKey, JSON.stringify(parsed))
        localStorage.removeItem('cartItems')
        return parsed
      } catch {}
    }
    return []
  }

  const [items, setItems] = useState<CartItem[]>(loadItems)
  const [menuSlug, setMenuSlug] = useState<string | null>(location ?? null)

  // keep menuSlug aligned with prop (public routes will pass it)
  useEffect(() => {
    setMenuSlug(location ?? null)
  }, [location])

  // swap storage when namespace/handle/location changes
  useEffect(() => {
    setItems(loadItems())
  }, [storageKey])

  // persist
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(items))
    }
  }, [storageKey, items])

  const toppingsMatch = (a: NormalizedTopping[], b: NormalizedTopping[]) => {
    if (a.length !== b.length) return false
    const idsA = a.map((t) => t.id).sort()
    const idsB = b.map((t) => t.id).sort()
    return idsA.every((id, idx) => id === idsB[idx])
  }

  const addItem = (item: CartItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id && toppingsMatch(i.toppings, item.toppings))
      if (idx !== -1) {
        const next = [...prev]
        next[idx].quantity += item.quantity
        return next
      }
      return [...prev, item]
    })
  }

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))
  const clearCart = () => {
    if (typeof window !== 'undefined') localStorage.removeItem(storageKey)
    setItems([])
  }

  const getTotal = () =>
    items.reduce((sum, item) => {
      const t = item.toppings.reduce((s, x) => s + x.price, 0)
      return sum + (item.price + t) * item.quantity
    }, 0)

  const getTotalItems = () => items.reduce((s, i) => s + i.quantity, 0)

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
