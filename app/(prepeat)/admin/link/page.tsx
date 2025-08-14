import LinkAccount from '@/components/LinkAccount'
import { useMerchant } from '@/components/MerchantContext'
import React from 'react'

type Props = {}

export default function page({}: Props) {
  const merchant = useMerchant()
  return <LinkAccount merchant={merchant} />
}
