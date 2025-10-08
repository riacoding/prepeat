'use client'

import { useSafeAuthenticator } from '@/hooks/useSafeAuthenticator'
import { Merchant } from '@/types'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react'

export type SignupStep = 'signup' | 'confirm' | 'business' | 'link'

interface SignupContextType {
  currentStep: SignupStep
  setStep: (step: SignupStep) => void

  email: string
  setEmail: (email: string) => void

  password: string
  setPassword: (password: string) => void

  userId: string
  setUserId: (userId: string) => void

  merchant: Merchant | null
  setMerchant: (merchant: Merchant | null) => void
}

const SignupContext = createContext<SignupContextType | undefined>(undefined)

export function SignupProvider({ children }: { children: ReactNode }) {
  const [currentStep, setStep] = useState<SignupStep>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userId, setUserId] = useState('')
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [hasHydrated, setHasHydrated] = useState(false)
  const { prepEatUser } = useSafeAuthenticator()

  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (prepEatUser) {
      setUserId(prepEatUser.id)
    }
  }, [prepEatUser])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedStep = sessionStorage.getItem('signupStep')
      if (savedStep && ['signup', 'confirm', 'business', 'link'].includes(savedStep)) {
        setStep(savedStep as SignupStep)
      }
      setHasHydrated(true)
    }
  }, [])

  // 🔁 Auto-redirect when onboarding should move into /admin
  useEffect(() => {
    const shouldRedirect = currentStep === 'business' && pathname.startsWith('/signup')

    if (shouldRedirect) {
      router.push('/signup/onboarding')
    }
  }, [currentStep, pathname, router])

  // 🔁 Restore persisted values from sessionStorage
  useEffect(() => {
    const savedStep = sessionStorage.getItem('signupStep')
    const savedEmail = sessionStorage.getItem('signupEmail')
    const savedUserId = sessionStorage.getItem('signupUserId')
    const savedMerchant = sessionStorage.getItem('signupMerchant')

    if (savedStep && ['signup', 'confirm', 'business', 'link'].includes(savedStep)) {
      setStep(savedStep as SignupStep)
    }

    if (savedEmail) setEmail(savedEmail)
    if (savedUserId) setUserId(savedUserId)
    if (savedMerchant) {
      try {
        setMerchant(JSON.parse(savedMerchant))
      } catch (err) {
        console.warn('Invalid merchant JSON in sessionStorage', err)
      }
    }
  }, [])

  // 🔁 Persist changes
  useEffect(() => {
    if (hasHydrated) {
      sessionStorage.setItem('signupStep', currentStep)
    }
  }, [currentStep, hasHydrated])

  useEffect(() => {
    sessionStorage.setItem('signupEmail', email)
  }, [email])

  useEffect(() => {
    sessionStorage.setItem('signupUserId', userId)
  }, [userId])

  useEffect(() => {
    if (merchant) {
      sessionStorage.setItem('signupMerchant', JSON.stringify(merchant))
    } else {
      sessionStorage.removeItem('signupMerchant')
    }
  }, [merchant])

  const value = useMemo(
    () => ({
      currentStep,
      setStep,
      email,
      setEmail,
      password,
      setPassword,
      userId,
      setUserId,
      merchant,
      setMerchant,
    }),
    [currentStep, email, password, userId, merchant]
  )

  return <SignupContext.Provider value={value}>{children}</SignupContext.Provider>
}

export function useSignupContext(): SignupContextType {
  const context = useContext(SignupContext)
  if (!context) {
    throw new Error('useSignupContext must be used within a SignupProvider')
  }
  return context
}
