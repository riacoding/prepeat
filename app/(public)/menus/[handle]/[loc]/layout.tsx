//app/(public)/menus/[handle]/[loc]/layout.tsx
'use server'
import { redirect } from 'next/navigation'
import { MenuProvider } from './MenuProvider'
import { getCachedMenu } from '@/lib/menuCache'
import { getPublicMerchantFromHandle } from '@/lib/ssr-actions'
import Providers from '@/components/Providers'
import notFound from './not-found'
import Link from 'next/link'
import HeaderLogo from '@/components/HeaderLogo'
import CartIcon from '@/components/CartIcon'

type Params = Promise<{ loc: string; handle: string }>

export default async function MenuLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const year = new Date().getFullYear()
  try {
    const { handle, loc } = await params
    const merchant = await getPublicMerchantFromHandle(handle)
    if (!loc) {
      console.error('Menu route missing loc param')
      throw new Error('Missing locationId')
    }
    if (!merchant) return notFound()

    try {
      const { menu, items } = await getCachedMenu(merchant.id, loc)
      return (
        <Providers merchant={merchant} menu={menu} items={items} location={loc}>
          <header className='bg-white border-b border-gray-200 shadow-sm p-4 flex justify-between items-center'>
            <Link href={`/menus/${handle}/${loc}`}>
              <HeaderLogo />
            </Link>
            <div className='flex align-center justify-center mt-5  gap-5'>
              <CartIcon />
            </div>
          </header>

          <main className='flex-1 p-4 bg-gray-50'>{children}</main>

          <footer className='bg-white border-t flex justify-center border-gray-200 text-sm text-gray-600 gap-5'>
            <div> © prepeat.io {year}</div>
          </footer>
        </Providers>
      )
    } catch (e) {
      console.error('Menu fetch failed', e)
      return notFound() // or redirect('/')
    }
  } catch (err) {
    console.error('Menu not found or fetch failed', err)
    redirect('/')
  }
}
