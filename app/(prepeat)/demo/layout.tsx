import { getUserBySub, getServerMerchant } from '@/lib/ssr-actions'
import { MerchantPublicProvider } from '@/components/MerchantPublicContext'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getCurrentUserServer } from '@/util/amplify'

export default async function DemoLayout({ children }: { children: ReactNode }) {
  const merchantId = process.env.NEXT_PUBLIC_DEMO_MERCHANT_ID!
  console.log('merchantId', merchantId)
  const merchant = (await getServerMerchant(merchantId)) || null

  return <MerchantPublicProvider merchant={merchant}>{children}</MerchantPublicProvider>
}
