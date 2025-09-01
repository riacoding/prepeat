'use client'
import React, { ReactNode } from 'react'
import { outputs } from '../lib/amplifyOutputs'
import { Amplify } from 'aws-amplify'
import { Authenticator } from '@aws-amplify/ui-react'
import { CartProvider } from '@/components/CartContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MerchantPublicProvider } from './MerchantPublicContext'
import { LDProvider } from 'launchdarkly-react-client-sdk'

Amplify.configure(outputs, { ssr: true })

type RootLayoutProps = {
  children: ReactNode
}

const queryClient = new QueryClient()

const AdminProviders: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <Authenticator.Provider>
      <LDProvider clientSideID='687543b10a284709202b0777'>
        <QueryClientProvider client={queryClient}>
          <MerchantPublicProvider merchant={null}>
            <CartProvider namespace='admin'>
              <div className='flex-1 flex flex-col'>{children}</div>
            </CartProvider>
          </MerchantPublicProvider>
        </QueryClientProvider>
      </LDProvider>
    </Authenticator.Provider>
  )
}

export default AdminProviders
