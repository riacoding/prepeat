// getSquareItemsWithModifiers.int.test.ts
import { describe, it } from 'vitest'
import { getSquareItemsWithModifiers } from '../../lib/ssr-actions'
import { SquareClient, SquareEnvironment } from 'square'
import { config } from '@dotenvx/dotenvx'
config({ path: '.env.e2e', override: false })

const token = process.env.SQUARE_SANDBOX_TOKEN

function sanitizeBigInts(obj: any): any {
  if (typeof obj === 'bigint') return obj.toString()
  if (Array.isArray(obj)) return obj.map(sanitizeBigInts)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, sanitizeBigInts(v)]))
  }
  return obj
}

;(token ? describe : describe.skip)('Square sandbox integration', () => {
  it('fetches items and modifier lists', async () => {
    const client = new SquareClient({ token, environment: SquareEnvironment.Sandbox })
    const out = await getSquareItemsWithModifiers({ secretsArn: 'n/a' } as any, client)
    // No strict expectations—just proves end-to-end wiring
    console.log(`Fetched ${JSON.stringify(sanitizeBigInts(out), null, 2)} items with modifiers`)
  })
})
