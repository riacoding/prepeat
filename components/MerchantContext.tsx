// components/MerchantContext.tsx
'use client'
import { Merchant } from '@/types'
import { createContext, useContext } from 'react'

const MerchantContext = createContext<Merchant | null>(null)

export const MerchantProvider = ({ merchant, children }: { merchant: Merchant | null; children: React.ReactNode }) => {
  return <MerchantContext.Provider value={merchant}>{children}</MerchantContext.Provider>
}

export const useMerchant = () => {
  const context = useContext(MerchantContext)
  if (!context) throw new Error('useMerchant must be used within a MerchantProvider')
  return context
}
