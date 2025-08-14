// tests/example.spec.ts
import { test, expect } from '@playwright/test'

const E2E_BASE_URL = process.env.E2E_BASE_URL

test('homepage has title', async ({ page }) => {
  await page.goto(`${E2E_BASE_URL}/home`)
  await expect(page).toHaveTitle(/Prepeat.io/i)
})
