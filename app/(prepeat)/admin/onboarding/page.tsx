import { getUserBySub, getServerMerchant } from '@/lib/ssr-actions'
import { redirect } from 'next/navigation'
import BusinessForm from '@/components/CreateBusinessForm'
import SquareLinkStep from '@/components/LinkAccount'
import { ClearSignupSession } from '@/components/ClearSignupSession'
import { getCurrentUserServer } from '@/util/amplify'
import { SignupProvider } from '@/components/SignupContext'

export default async function OnboardingPage() {
  const res = await getCurrentUserServer()
  console.log(JSON.stringify(res))
  if (!res || !res.user?.userId) redirect('/login')

  const userRecord = await getUserBySub(res.user.userId)
  console.log('userRecord', 'onboarding layout', userRecord)
  if (!userRecord) redirect('/login')

  if (!userRecord.merchantId) {
    return (
      <>
        <ClearSignupSession />
        <BusinessForm />
      </>
    )
  }

  const merchant = await getServerMerchant(userRecord.merchantId)
  console.log('merchant', merchant)
  if (!merchant) {
    return (
      <>
        <ClearSignupSession />
        <BusinessForm />
      </>
    )
  }

  if (merchant.accessToken == 'provisional') {
    console.log('merchant is provisional')
    return (
      <>
        <ClearSignupSession />
        <SquareLinkStep />
      </>
    )
  }

  redirect('/admin')
}
