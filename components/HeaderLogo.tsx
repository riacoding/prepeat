'use client'

import { StorageImage } from '@aws-amplify/ui-react-storage'
import { usePublicMerchant } from './MerchantPublicContext'
import Image from 'next/image'

export default function HeaderLogo() {
  const { merchant } = usePublicMerchant()
  const logo = merchant?.s3ItemKey
  return (
    <header className='flex flex-col items-center justify-center min-h-24 bg-transparent'>
      {logo ? (
        <StorageImage width={128} className='h-32 w-32' path={`${logo}`} alt='logo' />
      ) : (
        <Image width={128} height={64} src={logo ?? '/logo.png'} alt='Logo' className='h-16 w-32' priority />
      )}
    </header>
  )
}
