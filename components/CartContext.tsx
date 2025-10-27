'use client'

import { useMenu } from '@/app/(public)/menus/[handle]/[loc]/MenuProvider'
import { CartItem, Modifier, ModifierAmplify, NormalizedModifier } from '@/types'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

type CartContextType = {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'lineId'>) => void
  removeItem: (id: string) => void
  removeAllItems: (id: string) => void
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

  const cloneItem = (it: Omit<CartItem, 'lineId'> & { lineId?: string }): CartItem => ({
    ...it,
    modifiers: it.modifiers.map((m) => ({ ...m })),
    lineId: it.lineId ?? cartLineId(it.catalogVariationId, it.modifiers, it.quantity),
  })

  const modifiersMatch = (a: ModifierAmplify[], b: ModifierAmplify[]) => {
    if (a.length !== b.length) return false
    const idsA = a.map((t) => t.modifierId).sort()
    const idsB = b.map((t) => t.modifierId).sort()
    console.log('modifiersMatch', idsA, idsB)
    return idsA.every((id, idx) => id === idsB[idx])
  }

  // FAST readable key (good enough for most cases)
  function cartLineId(itemId: string, mods: ModifierAmplify[], quantity: number) {
    return signature(itemId, mods, quantity) // or hash this if you want shorter/opaque
  }

  // Normalize (order-invariant, ignores zero)
  function normalizeModifiers(mods: ModifierAmplify[], quantity: number) {
    return mods
      .filter((m) => (quantity ?? 1) > 0)
      .map((m) => ({ id: m.modifierId, q: quantity ?? 1 }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  // Deterministic string for hashing/keys
  function signature(itemId: string, mods: ModifierAmplify[], quantity: number) {
    const norm = normalizeModifiers(mods, quantity)
    return `${itemId}|${norm.map((m) => `${m.id}`).join(',')}`
  }

  // Optional: short opaque key (async, uses Web Crypto)
  async function cartLineIdHashed(itemId: string, mods: ModifierAmplify[], quantity: number) {
    const s = signature(itemId, mods, quantity)
    const buf = new TextEncoder().encode(s)
    const digest = await crypto.subtle.digest('SHA-256', buf)
    const b = Array.from(new Uint8Array(digest))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
    return `${itemId}#${b.slice(0, 12)}` // short prefix
  }

  const addItem = (raw: Omit<CartItem, 'lineId'>) => {
    const item = cloneItem(raw)
    setItems((prev) => {
      const idx = prev.findIndex((l) => l.lineId === item.lineId)
      if (idx !== -1) {
        // Merge exact same line (same modifiers)
        return prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + (item.quantity || 1) } : l))
      }
      return [...prev, item]
    })
  }

  const setLineQuantity = (lineId: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((l) => l.lineId !== lineId)
        : prev.map((l) => (l.lineId === lineId ? { ...l, quantity: qty } : l))
    )
  }

  const removeItem = (lineId: string) => {
    setItems((prev) =>
      prev.flatMap((l) => (l.lineId === lineId ? (l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : []) : [l]))
    )
  }

  const removeAllItems = (lineId: string) => {
    setItems((prev) => prev.filter((l) => l.lineId !== lineId))
  }

  const clearCart = () => {
    if (typeof window !== 'undefined') localStorage.removeItem(storageKey)
    setItems([])
  }

  const getTotal = () =>
    items.reduce((sum, item) => {
      const t = item.modifiers.reduce((s, x) => s + x.priceCents, 0)
      return sum + (item.price + t) * item.quantity
    }, 0)

  const getTotalItems = () => items.reduce((s, i) => s + i.quantity, 0)

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, removeAllItems, clearCart, getTotal, getTotalItems, menuSlug }}
    >
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider')
  return context
}
