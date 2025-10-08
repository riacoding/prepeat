'use client'

import { useSignupContext } from './SignupContext'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'
import slugify from 'slugify'
import { useEffect, useState } from 'react'
import clsx from 'clsx'

const client = generateClient<Schema>()

const businessSchema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  handle: z
    .string()
    .min(3, 'Handle is required')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and dashes'),
})

type BusinessFormValues = z.infer<typeof businessSchema>

export default function CreateBusinessForm() {
  const { userId, setStep, setMerchant } = useSignupContext()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BusinessFormValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      businessName: '',
      handle: '',
    },
  })

  const businessName = watch('businessName')
  const handle = watch('handle')

  useEffect(() => {
    const slug = slugify(businessName || '', { lower: true, strict: true })
    if (slug && handle !== slug) {
      setValue('handle', slug)
    }
  }, [businessName, handle, setValue])

  useEffect(() => {
    if (!handle) {
      setIsAvailable(null)
      return
    }

    setIsChecking(true)
    const timer = setTimeout(async () => {
      try {
        const { data } = await client.models.Merchant.listMerchantByHandle(
          { handle },
          { selectionSet: ['handle'], authMode: 'userPool' }
        )
        console.log('list merchant', data)
        setIsAvailable(!data[0])
      } catch {
        setIsAvailable(null)
      } finally {
        setIsChecking(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [handle])

  const onSubmit = async (data: BusinessFormValues) => {
    if (!userId) {
      setServerError('Missing user ID in context.')
      return
    }

    if (!isAvailable) {
      setServerError('Handle is not available.')
      return
    }

    setServerError(null)
    try {
      const { data: merchant, errors } = await client.models.Merchant.create(
        {
          handle: data.handle,
          secretsArn: 'provisional',
          businessName: data.businessName,
          squareMerchantId: 'provisional',
          accessToken: 'provisional',
          locationIds: [],
        },
        { authMode: 'userPool' }
      )

      if (errors && errors.length > 0) {
        console.log(errors)
      }

      // Ensure merchant creation succeeded
      if (!merchant?.id) {
        throw new Error('Merchant creation returned no ID')
      }

      const { data: updatedUser, errors: userErrors } = await client.models.User.update(
        {
          id: userId,
          merchantId: merchant.id,
        },
        { authMode: 'userPool' }
      )

      if (userErrors?.length) {
        console.error('User update failed:', userErrors)
        throw new Error(userErrors.map((e) => e.message).join(', '))
      }

      setMerchant(merchant)
      setStep('link')
    } catch (err: any) {
      console.error(err)
      setServerError(err.message || 'Business creation failed')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className='space-y-4 max-w-md mx-auto'>
      <h1 className='text-xl font-semibold text-prepeat-orange'>Create your business</h1>

      <div>
        <label htmlFor='businessName' className='block text-sm font-medium text-gray-700 mb-1'>
          Business Name
        </label>
        <Input id='businessName' placeholder='Business Name' {...register('businessName')} />
        {errors.businessName && <p className='text-red-500 text-sm'>{errors.businessName.message}</p>}
      </div>

      <div>
        <label htmlFor='handle' className='block text-sm font-medium text-gray-700 mb-1'>
          Business Handle
        </label>
        <Input id='handle' placeholder='e.g. tasty-truck' {...register('handle')} />
        {errors.handle && <p className='text-red-500 text-sm'>{errors.handle.message}</p>}
        {handle && (
          <p
            className={clsx('text-sm mt-1', {
              'text-gray-500': isChecking,
              'text-green-600': isAvailable === true,
              'text-red-500': isAvailable === false,
            })}
          >
            {isChecking ? 'Checking availability...' : isAvailable ? 'Handle is available ✅' : 'Handle is taken ❌'}
          </p>
        )}
      </div>

      {serverError && <p className='text-red-500 text-sm'>{serverError}</p>}

      <Button
        type='submit'
        disabled={isSubmitting || !isAvailable}
        className='bg-prepeat-orange hover:bg-orange-600 w-full sm:w-auto'
      >
        {isSubmitting ? 'Creating...' : 'Create Business'}
      </Button>
    </form>
  )
}
