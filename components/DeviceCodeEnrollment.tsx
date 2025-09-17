'use client'

import React from 'react'
import type { RequestCodeResponse } from '@/types'

type Props = {
  merchantId: string
  createdBy: string
}

function secondsRemaining(expSeconds: number) {
  const now = Math.floor(Date.now() / 1000)
  return Math.max(0, expSeconds - now)
}

function formatHMS(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function CodeDisplay({ code }: { code: RequestCodeResponse }) {
  const [left, setLeft] = React.useState(() => secondsRemaining(code.expiresAt))

  React.useEffect(() => {
    const id = setInterval(() => setLeft(secondsRemaining(code.expiresAt)), 1000)
    return () => clearInterval(id)
  }, [code.expiresAt])

  const expired = left <= 0

  return (
    <div className='rounded-xl border p-4'>
      <div className='text-sm text-gray-500 mb-1'>
        {code.codeType === 'EXISTING' ? 'Existing enrollment code' : 'New enrollment code'}
      </div>
      <div className='font-mono text-2xl tracking-wide break-all'>{code.codeHash}</div>
      <div className='mt-2 text-sm'>
        {expired ? (
          <span className='text-red-600'>Expired</span>
        ) : (
          <>
            Expires in <span className='font-semibold'>{formatHMS(left)}</span>
          </>
        )}
      </div>
    </div>
  )
}

export default function DeviceCodeEnrollment({ merchantId, createdBy }: Props) {
  const [loading, setLoading] = React.useState(false)
  const [fetching, setFetching] = React.useState(true)
  const [err, setErr] = React.useState<string | null>(null)
  const [code, setCode] = React.useState<RequestCodeResponse | null>(null)

  // On mount: try to fetch active code (GET)
  React.useEffect(() => {
    let ignore = false
    async function run() {
      setFetching(true)
      setErr(null)
      try {
        const r = await fetch(`/api/devicecode?merchantId=${encodeURIComponent(merchantId)}`, {
          method: 'GET',
          headers: { accept: 'application/json' },
          cache: 'no-store',
        })
        if (r.ok) {
          const j = (await r.json()) as RequestCodeResponse
          console.log('code.expiresAt type:', typeof j.expiresAt, j.expiresAt)
          if (!ignore) setCode(j)
        } else if (r.status !== 404) {
          const j = await r.json().catch(() => ({}) as any)
          if (!ignore) setErr(j?.error || `HTTP ${r.status}`)
        }
      } catch (e: any) {
        if (!ignore) setErr(e?.message ?? 'Network error')
      } finally {
        if (!ignore) setFetching(false)
      }
    }
    run()
    return () => {
      ignore = true
    }
  }, [merchantId])

  async function onRequestCode() {
    setLoading(true)
    setErr(null)
    try {
      const r = await fetch('/api/devicecode', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ merchantId, createdBy }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setCode(j as RequestCodeResponse)
    } catch (e: any) {
      setErr(e?.message ?? 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  // If there is a code but it expires, let users request a fresh one without reloading
  const expired = code ? Math.floor(Date.now() / 1000) >= Number(code.expiresAt) : false

  return (
    <div className='space-y-4'>
      <h3 className='text-lg font-semibold'>Device Code</h3>

      {fetching && <div className='text-sm text-gray-500'>Checking for active code…</div>}

      {err && <div className='rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700'>{err}</div>}

      {!fetching && code && (
        <>
          <CodeDisplay code={code} />
          {expired && (
            <div>
              <button
                onClick={onRequestCode}
                disabled={loading}
                className='mt-3 inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50'
              >
                {loading ? 'Requesting…' : 'Request new code'}
              </button>
            </div>
          )}
        </>
      )}

      {!fetching && !code && (
        <div>
          <button
            onClick={onRequestCode}
            disabled={loading}
            className='inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50'
          >
            {loading ? 'Requesting…' : 'Request code'}
          </button>
        </div>
      )}
    </div>
  )
}
