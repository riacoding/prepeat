'use client'

import { EagerMenu } from '@/lib/fetchMenuWithItems'
import { Menu, NormalizedItem } from '@/types'
import { createContext, useContext, useEffect } from 'react'

type MenuContextValue = {
  items: NormalizedItem[]
  menu: EagerMenu
  location: string
  useImages: boolean
  getItemById: (id: string) => NormalizedItem | undefined
}

const MenuContext = createContext<MenuContextValue | undefined>(undefined)

export function MenuProvider({
  items,
  menu,
  children,
  location,
}: {
  items: NormalizedItem[]
  menu: EagerMenu
  children: React.ReactNode
  location: string
}) {
  const getItemById = (id: string) => items.find((item) => item.id === id)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastMenuLoc', location)
    }
  }, [location])

  return <MenuContext.Provider value={{ items, getItemById, menu, location }}>{children}</MenuContext.Provider>
}

export function useMenu() {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error('useMenu must be used within a MenuProvider')
  return ctx
}

export function useMenuItem(id: string) {
  const { getItemById } = useMenu()
  return getItemById(id)
}
