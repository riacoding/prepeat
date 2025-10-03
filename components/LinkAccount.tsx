'use client'

import { useEffect, useState } from 'react'
import { useSignupContext } from './SignupContext'
import { Button } from '@/components/ui/button'
import { getAuthUrl } from '@/lib/ssr-actions'
import Link from 'next/link'
import { PublicMerchant } from '@/types'
import { useMerchant } from './MerchantContext'

export default function LinkAccount() {
  const [url, setUrl] = useState<string | null>(null)
  const [authState, setAuthState] = useState<string | null>(null)
  const [isConfiguring, setIsConfiguring] = useState(true)
  const merchant = useMerchant()

  useEffect(() => {
    async function getUrl() {
      if (merchant?.id) {
        const { url, state } = await getAuthUrl(merchant.id)
        setUrl(url)
        setAuthState(state)

        // Set the oauth_state cookie here
        if (state) {
          document.cookie = `oauth_state=${state}; Path=/; Secure; SameSite=Lax`
        }
      }
      setIsConfiguring(false)
    }
    getUrl()
  }, [merchant])

  if (!merchant) {
    return <div className='text-center text-sm text-gray-500'>No merchant found.</div>
  }

  return (
    <div className='max-w-md mx-auto space-y-6 border p-6 rounded-lg shadow-sm bg-white'>
      <h1 className='text-2xl font-semibold text-center text-prepeat-orange'>Your account is almost ready</h1>

      <div className='text-center text-gray-700'>
        <p className='text-lg font-medium'>{merchant.businessName}</p>
        <p className='text-sm text-gray-500'>@{merchant.handle}</p>
      </div>

      <div className='text-center'>
        <p className='text-gray-600 mb-4'>To accept payments and manage orders, please link your Square account.</p>
        <div>{url}</div>
        <Button size='lg' className='w-full bg-prepeat-orange hover:bg-orange-600' disabled={!url} asChild>
          <Link href={url || '#'} aria-disabled={!url}>
            {isConfiguring ? 'configuring' : 'Link Square'}
          </Link>
        </Button>
      </div>
    </div>
  )
}
