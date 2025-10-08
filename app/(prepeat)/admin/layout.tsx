import { getUserBySub, getServerMerchant } from '@/lib/ssr-actions'
import { MerchantProvider } from '@/components/MerchantContext'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getCurrentUserServer } from '@/util/amplify'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const res = await getCurrentUserServer()
  if (!res || !res.user?.userId) redirect('/login')

  const userRecord = await getUserBySub(res.user?.userId)
  console.log('userRecord', 'admin layout', userRecord?.id)
  //if (!userRecord) redirect('/login')

  const merchant = userRecord.merchantId ? await getServerMerchant(userRecord.merchantId) : null

  return <MerchantProvider merchant={merchant}>{children}</MerchantProvider>
}
