'use client'

import * as React from 'react'
import { useActionState, useEffect, useState } from 'react'
import { subscribeEmailAction } from '@/lib/ssr-actions'
import { Button } from '@/components/ui/button'
import clsx from 'clsx'

type Placement = 'homepage_hero' | 'footer' | 'modal'
type Variant = 'inline' | 'stacked'

type Props = {
  placement?: Placement
  variant?: Variant
  className?: string
  inputClassName?: string
  buttonLabel?: string
  successMessage?: string
}

const initialState = { ok: false, message: '' }

export default function EmailCapture({
  placement = 'homepage_hero',
  variant = 'inline',
  className,
  inputClassName,
  buttonLabel = 'Join the List',
  successMessage = 'You’re on the list. Thanks!',
}: Props) {
  const [state, formAction] = useActionState(subscribeEmailAction, initialState)
  const [url, setUrl] = useState('')
  const [utm, setUtm] = useState<{ source?: string; medium?: string; campaign?: string }>({})

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUrl(window.location.href)
      const p = new URLSearchParams(window.location.search)
      setUtm({
        source: p.get('utm_source') ?? undefined,
        medium: p.get('utm_medium') ?? undefined,
        campaign: p.get('utm_campaign') ?? undefined,
      })
    }
  }, [])

  const stacked = variant === 'stacked'

  return (
    <form action={formAction} className={clsx('w-full', className)} noValidate>
      {/* Honeypot (bot trap) */}
      <div className='hidden' aria-hidden='true'>
        <label htmlFor='website'>Website</label>
        <input id='website' name='website' type='text' tabIndex={-1} autoComplete='off' />
      </div>

      {/* Hidden context inputs */}
      <input type='hidden' name='placement' value={placement} />
      <input type='hidden' name='url' value={url} />
      <input type='hidden' name='utm_source' value={utm.source ?? ''} />
      <input type='hidden' name='utm_medium' value={utm.medium ?? ''} />
      <input type='hidden' name='utm_campaign' value={utm.campaign ?? ''} />

      <div
        className={clsx('flex justify-center gap-3 max-w-md mx-auto', stacked ? 'flex-col' : 'flex-col sm:flex-row')}
      >
        <label htmlFor='email' className='sr-only'>
          Email Address
        </label>
        <input
          id='email'
          name='email'
          type='email'
          placeholder='you@example.com'
          required
          className={clsx('px-4 py-3 rounded-xl border border-gray-300 w-full sm:w-64', inputClassName)}
        />
        <Button
          type='submit'
          className='bg-prepeat-orange text-white font-medium px-6 py-3 rounded-xl hover:bg-orange-600 transition'
          disabled={state.ok}
        >
          {state.ok ? 'Subscribed' : buttonLabel}
        </Button>
      </div>

      <p
        className={clsx(
          'text-sm mt-3 text-center',
          state.ok ? 'text-green-700' : state.message ? 'text-red-600' : 'text-gray-500'
        )}
        role='status'
      >
        {state.ok ? successMessage : state.message || ''}
      </p>
    </form>
  )
}
