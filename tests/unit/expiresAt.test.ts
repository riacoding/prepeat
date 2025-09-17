import { describe, it, expect } from 'vitest'
import { expiresAt } from '@/lib/utils'

describe('expiresAt', () => {
  it('returns a Date when input is a Date', () => {
    const base = new Date('2025-09-16T12:00:00Z')
    const result = expiresAt(base, 10)
    expect(result).toBeInstanceOf(Date)
    expect((result as Date).toISOString()).toBe('2025-09-16T12:10:00.000Z')
  })

  it('returns a number when input is a timestamp', () => {
    const base = Date.parse('2025-09-16T12:00:00Z')
    const result = expiresAt(base, 10)
    expect(typeof result).toBe('number')
    expect(result).toBe(Date.parse('2025-09-16T12:10:00Z'))
  })

  it('returns a string when input is an ISO string', () => {
    const base = '2025-09-16T12:00:00.000Z'
    const result = expiresAt(base, 10)
    expect(typeof result).toBe('string')
    expect(result).toBe('2025-09-16T12:10:00.000Z')
  })
})
