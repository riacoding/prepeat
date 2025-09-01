'use client'

import { SignupProvider, useSignupContext } from '@/components/SignupContext'
import CreateBusinessForm from '@/components/CreateBusinessForm'
import LinkAccount from '@/components/LinkAccount'
import { useEffect } from 'react'
import { PublicMerchant } from '@/types'

function OnboardingStepManager() {
  const { currentStep, merchant } = useSignupContext()
  console.log('currentStep', currentStep)
  return (
    <div className='w-full md:max-w-md mx-auto p-4'>
      {currentStep === 'business' && <CreateBusinessForm />}
      {currentStep === 'link' && <LinkAccount />}
    </div>
  )
}

function InitBusinessStep() {
  const { setStep } = useSignupContext()
  useEffect(() => {
    setStep('business')
  }, [setStep])
  return null
}

export default function AdminOnboardingPage() {
  return (
    <>
      <InitBusinessStep />
      <OnboardingStepManager />
    </>
  )
}
