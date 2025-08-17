// app/layout.tsx (or wherever your RootLayout is defined)

import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/Providers'
import CartIcon from '@/components/CartIcon'
import Image from 'next/image'
import Link from 'next/link'
import MobileMenu from '@/components/MobileMenu'
import HeaderLogo from '@/components/HeaderLogo'
import { SignupProvider } from '@/components/SignupContext'
import { Toaster } from '@/components/ui/toaster'

export const runtime = 'nodejs'

export const metadata: Metadata = {
  title: 'Prepeat.io',
  description: 'Mobile Menu discovery',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const year = new Date().getFullYear()

  return (
    <html lang='en'>
      <body className='min-h-screen flex flex-col'>
        {children} <Toaster />{' '}
      </body>
    </html>
  )
}
