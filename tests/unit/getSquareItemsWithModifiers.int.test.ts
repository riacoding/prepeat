// getSquareItemsWithModifiers.int.test.ts
import { vi, describe, it } from 'vitest'
import * as ssr from '../../lib/ssr-actions'
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

it('fetches items and modifier lists', async () => {
  vi.spyOn(ssr, 'createModifierList').mockResolvedValue({
    merchantId: '1234',
    modifierListId: 'mock',
  })
  const client = new SquareClient({ token, environment: SquareEnvironment.Sandbox })
  const stubSave = vi.fn().mockResolvedValue({ ok: true })
  const out = await ssr.getSquareItemsWithModifiers(
    { id: '1234', secretsArn: 'n/a' } as any,
    client,
    { saveModifierList: stubSave } // <-- override default saver
  )

  console.log(`Fetched ${JSON.stringify(sanitizeBigInts(out), null, 2)} items with modifiers`)
})
