import { describe, it, expect } from 'vitest'
import { expiresAt } from '@/lib/utils' // adjust the import path

describe('expiresAt', () => {
  it('returns epoch SECONDS (number) when given a timestamp (ms)', () => {
    const nowMs = Date.now()
    const result = expiresAt(nowMs, 5) // number → seconds
    expect(typeof result).toBe('number')
    // should be close to (now + 5m) in seconds
    const expectedSec = Math.floor((nowMs + 5 * 60_000) / 1000)
    expect(result).toBe(expectedSec)
    // sanity: 10-digit seconds, not 13-digit ms
    expect(String(result).length).toBeGreaterThanOrEqual(10)
    expect(String(result).length).toBeLessThanOrEqual(11) // future-proof
  })

  it('returns a string when given an ISO string', () => {
    const nowIso = new Date().toISOString()
    const result = expiresAt(nowIso, 5)
    expect(typeof result).toBe('string')
    expect(new Date(result).getTime()).toBeGreaterThan(new Date(nowIso).getTime())
  })

  it('returns a Date when given a Date', () => {
    const now = new Date()
    const result = expiresAt(now, 5)
    expect(result).toBeInstanceOf(Date)
    expect(result.getTime()).toBeGreaterThan(now.getTime())
  })
})
