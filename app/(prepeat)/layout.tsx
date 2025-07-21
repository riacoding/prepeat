import type { Metadata } from 'next'
import '@/app/globals.css'
import Link from 'next/link'
import MobileMenu from '@/components/MobileMenu'
import HeaderLogo from '@/components/HeaderLogo'
import AdminProviders from '@/components/AdminProviders'
import DesktopMenu from '@/components/DesktopMenu'

export const metadata: Metadata = {
  title: 'Prepeat.io',
  description: 'Mobile Menu Discovery',
}

export default async function PrepeatLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const year = new Date().getFullYear()

  return (
    <AdminProviders>
      {/* Header */}
      <header className='bg-white border-b border-gray-200 shadow-sm p-4 flex justify-between items-center'>
        <Link href='/home'>
          <HeaderLogo />
        </Link>
        <div className='flex align-center justify-center mt-5  gap-5'>
          <DesktopMenu />
          <MobileMenu isLoggedIn={true} />
        </div>
      </header>

      {/* Main content */}
      <main className='flex-1 p-4 bg-gray-50'>{children}</main>

      {/* Footer */}
      <footer className='bg-white border-t flex justify-center border-gray-200 text-sm text-gray-600 gap-5'>
        <div> © prepeat.io {year}</div>
      </footer>
    </AdminProviders>
  )
}
