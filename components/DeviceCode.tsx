import { useState } from 'react'

export default function DeviceCodeEnrollment({ merchantId }: { merchantId: string }) {
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<null | { code: string; merchantId: string; expiresAt: string }>(null)
  const [err, setErr] = useState<string | null>(null)

  async function requestCode() {
    setLoading(true)
    setErr(null)
    try {
      const r = await fetch('/api/devicecode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId }),
      })
      if (!r.ok) throw new Error(`Request failed: ${r.status}`)
      const data = await r.json()
      setRes(data)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='space-y-3'>
      <button onClick={requestCode} disabled={loading} className='btn btn-primary'>
        {loading ? 'Requesting…' : 'Request enrollment code'}
      </button>

      {err && <div className='text-red-600 text-sm'>{err}</div>}

      {res && (
        <div className='rounded border p-3'>
          <div className='text-xs text-gray-500'>Vendor</div>
          <div className='font-mono'>{res.merchantId}</div>
          <div className='mt-2 text-xs text-gray-500'>Code</div>
          <div className='flex items-center gap-2'>
            <code className='font-mono text-lg'>{res.code}</code>
            <button onClick={() => navigator.clipboard.writeText(res.code)} className='btn btn-sm'>
              Copy
            </button>
          </div>
          <div className='mt-2 text-xs text-gray-500'>Expires: {new Date(res.expiresAt).toLocaleString()}</div>
        </div>
      )}
    </div>
  )
}
