// tests/example.spec.ts
import { test, expect } from '@playwright/test'

test('homepage has title', async ({ page }) => {
  await page.goto('http://localhost:3000/home')
  await expect(page).toHaveTitle(/Prepeat.io/i)
})
