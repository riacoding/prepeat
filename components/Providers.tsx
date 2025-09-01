'use client'
import React, { ReactNode } from 'react'
import { outputs } from '../lib/amplifyOutputs'
import { Amplify } from 'aws-amplify'
import { Authenticator } from '@aws-amplify/ui-react'
import { CartProvider } from '@/components/CartContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MerchantPublicProvider } from './MerchantPublicContext'
import { Merchant, MerchantSelected, NormalizedItem } from '@/types'
import { EagerMenu } from '@/lib/fetchMenuWithItems'
import { MenuProvider } from '@/app/(public)/menus/[handle]/[loc]/MenuProvider'

Amplify.configure(outputs, { ssr: true })

type RootLayoutProps = {
  children: ReactNode
  merchant: MerchantSelected | null
  items: NormalizedItem[]
  menu: EagerMenu
  location: string
}

const queryClient = new QueryClient()

const Providers: React.FC<RootLayoutProps> = ({ children, merchant, items, menu, location }) => {
  return (
    <Authenticator.Provider>
      <MerchantPublicProvider merchant={merchant}>
        <QueryClientProvider client={queryClient}>
          <MenuProvider items={items} menu={menu} location={location}>
            <CartProvider handle={merchant?.handle ?? null} location={location}>
              <div className='flex-1 flex flex-col'>{children}</div>
            </CartProvider>
          </MenuProvider>
        </QueryClientProvider>
      </MerchantPublicProvider>
    </Authenticator.Provider>
  )
}

export default Providers
