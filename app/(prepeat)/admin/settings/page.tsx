'use client'

import ImageUploader from '@/components/ImageUploader'
import { useMerchant } from '@/components/MerchantContext'
import { useSafeAuthenticator } from '@/hooks/useSafeAuthenticator'
import { updateMerchant } from '@/lib/ssr-actions'
import { Switch } from '@/components/ui/switch'

import React, { useEffect, useState } from 'react'
import { StorageImage } from '@aws-amplify/ui-react-storage'
import { Button } from '@/components/ui/button'

type Props = {}

export default function Settings({}: Props) {
  const [merchantLogo, setMerchantLogo] = useState('')
  const [displayImages, setDisplayImages] = useState(false)
  const [showImageUploader, setShowImageUploader] = useState(false)
  const [taxRateDisplay, setTaxRateDisplay] = useState('')
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const { handle, id, s3ItemKey, displayImages: currentDisplayImages, taxRate } = useMerchant()
  const { user, authStatus } = useSafeAuthenticator()

  useEffect(() => {
    setMerchantLogo(s3ItemKey || '')
    setDisplayImages(!!currentDisplayImages)
    setTaxRateDisplay(taxRate ? taxRate.toString() : '0.00')
  }, [s3ItemKey, currentDisplayImages, taxRate])

  useEffect(() => {
    if (!merchantLogo || merchantLogo === s3ItemKey) return
    updateMerchant({ id, s3ItemKey: merchantLogo })
  }, [merchantLogo])

  const toggleDisplayImages = async () => {
    const newValue = !displayImages
    setDisplayImages(newValue)
    await updateMerchant({ id, displayImages: newValue })
  }

  if (authStatus !== 'authenticated') return null

  return (
    <div className='flex items-center justify-center'>
      <div className='md:max-w-xl flex flex-col items-start justify-center space-y-6 bg-orange-50 p-5'>
        <h1 className='text-xl font-bold'>Settings</h1>
        {/* Toggle Images */}
        <div className='flex items-center justify-between gap-4'>
          <label htmlFor='toggleDisplay' className='text-sm font-medium'>
            Show Product Images on Menu
          </label>
          <button
            onClick={toggleDisplayImages}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              displayImages ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                displayImages ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/*Sales Tax */}
        <div className='flex flex-col gap-1 max-w-xs'>
          <label htmlFor='taxRate' className='text-sm font-medium'>
            Sales Tax Rate (%)
          </label>
          <input
            id='taxRate'
            type='number'
            step='0.01'
            value={taxRateDisplay}
            onChange={(e) => setTaxRateDisplay(e.target.value)}
            onBlur={async () => {
              const parsed = parseFloat(taxRateDisplay)
              if (!isNaN(parsed)) {
                await updateMerchant({ id, taxRate: parsed })
              }
            }}
            className='border rounded px-3 py-2 text-sm'
          />
        </div>

        {/* Logo and ImageUploader */}
        <div className='flex flex-col space-y-4'>
          {merchantLogo ? (
            <div>
              <div className='w-40 h-40'>
                <label htmlFor='merchantLogo' className='text-sm font-bold'>
                  Current Logo
                </label>
                <StorageImage
                  id='merchantLogo'
                  className='w-full h-full object-cover rounded border'
                  path={merchantLogo}
                  alt='merchant logo'
                />
              </div>
              <Button onClick={() => setShowImageUploader(!showImageUploader)} variant='default'>
                {showImageUploader ? 'Cancel' : 'Update Logo'}
              </Button>
            </div>
          ) : (
            <div>
              <Button onClick={() => setShowImageUploader(true)} variant='default'>
                Upload Logo
              </Button>
            </div>
          )}
        </div>

        {/* Uploader */}
        <div
          className={`transition-all duration-300 overflow-hidden ${
            showImageUploader ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          {showImageUploader && (
            <ImageUploader
              onUpload={(key) => setMerchantLogo(key)}
              label='Upload Your Business Logo'
              path='logos/'
              existingKey={merchantLogo}
            />
          )}
        </div>

        {/* Refresh Token Button */}
        <div className='flex flex-col items-start space-y-2  border-gray-300'>
          <Button
            variant='default'
            onClick={async () => {
              try {
                const res = await fetch('/api/square/refresh', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ merchantId: id }),
                })

                if (!res.ok) throw new Error('Refresh failed')
                setRefreshStatus('success')
              } catch (err) {
                console.error('Token refresh error:', err)
                setRefreshStatus('error')
              }
            }}
          >
            Refresh Square Token
          </Button>
          {refreshStatus === 'success' && <span className='text-green-600 text-sm'>Token refreshed successfully</span>}
          {refreshStatus === 'error' && <span className='text-red-600 text-sm'>Failed to refresh token</span>}
        </div>
      </div>
    </div>
  )
}
