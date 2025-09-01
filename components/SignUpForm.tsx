'use client'

import { useSignupContext } from './SignupContext'
import { signUp } from '@aws-amplify/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'

const signupSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    // NEW: confirmPassword
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  // NEW: cross-field validation
  .refine((vals) => vals.password === vals.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

type SignupFormValues = z.infer<typeof signupSchema>

export default function SignupForm() {
  const { setEmail, setUserId, setStep } = useSignupContext()
  const [serverError, setServerError] = useState<string | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  })

  const onSubmit = async (data: SignupFormValues) => {
    setServerError(null)
    try {
      const result = await signUp({
        username: data.email,
        password: data.password, // confirmPassword is only for validation
        options: {
          autoSignIn: true,
          userAttributes: {
            email: data.email,
            given_name: data.firstName,
            family_name: data.lastName,
          },
        },
      })
      setEmail(data.email)
      setUserId(result.userId!)
      setStep('confirm')
    } catch (err: any) {
      if (err.name === 'UsernameExistsException') {
        toast({
          title: 'Account already exists',
          description: 'Redirecting to login...',
        })
        setTimeout(() => router.push('/login'), 1500)
        console.log(err)
        setServerError(err.message || 'Signup failed')
      } else {
        console.log('Signup error:', err)
        toast({
          title: 'Signup failed',
          description: err.message || 'An unknown error occurred.',
          variant: 'destructive',
        })
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className='space-y-4 max-w-md mx-auto'>
      <h1 className='text-xl font-semibold text-prepeat-orange'>Sign Up</h1>

      <div>
        <label htmlFor='firstName' className='block text-sm font-medium text-gray-700 mb-1'>
          First Name
        </label>
        <Input id='firstName' placeholder='First Name' {...register('firstName')} />
        {errors.firstName && <p className='text-red-500 text-sm'>{errors.firstName.message}</p>}
      </div>

      <div>
        <label htmlFor='lastName' className='block text-sm font-medium text-gray-700 mb-1'>
          Last Name
        </label>
        <Input id='lastName' placeholder='Last Name' {...register('lastName')} />
        {errors.lastName && <p className='text-red-500 text-sm'>{errors.lastName.message}</p>}
      </div>

      <div>
        <label htmlFor='email' className='block text-sm font-medium text-gray-700 mb-1'>
          Email
        </label>
        <Input id='email' type='email' placeholder='you@example.com' autoComplete='email' {...register('email')} />
        {errors.email && <p className='text-red-500 text-sm'>{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor='password' className='block text-sm font-medium text-gray-700 mb-1'>
          Password
        </label>
        <Input
          id='password'
          type='password'
          placeholder='••••••••'
          autoComplete='new-password'
          {...register('password')}
          aria-invalid={!!errors.password}
        />
        {errors.password && <p className='text-red-500 text-sm'>{errors.password.message}</p>}
      </div>

      {/* NEW: Confirm Password */}
      <div>
        <label htmlFor='confirmPassword' className='block text-sm font-medium text-gray-700 mb-1'>
          Confirm Password
        </label>
        <Input
          id='confirmPassword'
          type='password'
          placeholder='••••••••'
          autoComplete='new-password'
          {...register('confirmPassword')}
          aria-invalid={!!errors.confirmPassword}
        />
        {errors.confirmPassword && <p className='text-red-500 text-sm'>{errors.confirmPassword.message}</p>}
      </div>

      {serverError && <p className='text-red-500 text-sm'>{serverError}</p>}

      <Button type='submit' disabled={isSubmitting} className='bg-prepeat-orange hover:bg-orange-600 w-full sm:w-auto'>
        {isSubmitting ? 'Signing up...' : 'Sign Up'}
      </Button>
    </form>
  )
}
