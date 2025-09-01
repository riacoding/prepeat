// tests/cart-refresh-persist.spec.ts
import { test, expect, Page } from '@playwright/test'

const HANDLE = process.env.HANDLE || 'italiafire'
const REAL_LOC = process.env.REAL_LOC || 'regale'

async function openFirstItemDetail(page: Page) {
  const byTestId = page.locator('[data-testid="menu-item"], [data-testid="item-link"]').first()
  if (await byTestId.count()) return byTestId.click()
  const byHref = page.locator('a[href*="/menuitem/"], a[href*="/item/"]').first()
  if (await byHref.count()) return byHref.click()
  return page.getByRole('heading').first().click()
}
async function addToCartOnDetail(page: Page) {
  const addBtn = page.locator('[data-testid="add-to-cart"]').first()
  if (await addBtn.count()) return addBtn.click()
  return page.getByRole('button', { name: /add to cart/i }).click()
}

test('cart persists across refresh and checkout stays on real vendor', async ({ page }) => {
  // Go to real vendor menu
  await page.goto(`/menus/${HANDLE}/${REAL_LOC}`)
  await page.waitForLoadState('networkidle')

  // Item detail → add to cart
  await openFirstItemDetail(page)
  await page.waitForLoadState('networkidle')
  await addToCartOnDetail(page)

  // Open cart, then reload
  await page.goto(`/menus/${HANDLE}/${REAL_LOC}/cart`)
  await page.waitForLoadState('networkidle')
  await page.reload()
  await page.waitForLoadState('networkidle')

  // Assert cart has something visible
  const badge = page.locator('[data-testid="cart-badge"]')
  if (await badge.count()) await expect(badge).toBeVisible()
  else await expect(page.getByText(/subtotal|total/i)).toBeVisible()

  // Checkout → URL must remain under /regale (no /demo leak)
  const checkout = page.locator('[data-testid="checkout-button"]')
  if (await checkout.count()) await checkout.click()
  else await page.getByRole('button', { name: /checkout/i }).click()

  await expect(page).not.toHaveURL(new RegExp(`/menus/${HANDLE}/${REAL_LOC}/demo`))
  await expect(page).toHaveURL(new RegExp(`/menus/${HANDLE}/${REAL_LOC}/`))
})
