// app/menu/page.tsx
import { MerchantProvider } from '@/components/MerchantContext'
import MenuDisplay from './MenuDisplay'
import { getCachedMenu } from '@/lib/menuCache'
import { getPublicMerchantFromHandle } from '@/lib/ssr-actions'
import { Metadata } from 'next'

type Params = Promise<{ loc: string; handle: string }>

export async function generateMetadata({ params }: { children: React.ReactNode; params: Params }): Promise<Metadata> {
  const { loc, handle } = await params
  const merchant = await getPublicMerchantFromHandle(handle)
  const { menu } = await getCachedMenu(loc)

  const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://dev.prepeat.io'
  const fullUrl = `${siteUrl}/menus/${handle}/${loc}`

  return {
    title: `${merchant?.businessName}-${menu?.name}` || 'View Today’s Menu',
    description: 'Check out the latest offerings from our food truck!',
    openGraph: {
      title: `${merchant?.businessName}-${menu?.name}` || 'View Today’s Menu',
      description: 'Check out the latest offerings from our food truck!',
      url: fullUrl,
      images: [
        {
          url: menu?.logo || `${siteUrl}/menus/${handle}/${menu.locationId}`,
          width: 1200,
          height: 630,
          alt: 'Logo',
        },
      ],
      type: 'website',
    },
    metadataBase: new URL(siteUrl),
  }
}

export default async function VendorMenuPage({ params }: { params: Params }) {
  const { handle } = await params

  return <MenuDisplay />
}
