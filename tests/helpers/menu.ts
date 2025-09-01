// tests/helpers/menu.ts
import { Page, expect } from '@playwright/test'

export const HANDLE = process.env.HANDLE || 'italiafire'
export const DEMO_LOC = process.env.DEMO_LOC || 'demo'
export const REAL_LOC = process.env.REAL_LOC || 'regale'

export async function goToMenu(page: Page, handle = HANDLE, loc = DEMO_LOC) {
  await page.goto(`/menus/${handle}/${loc}`)
  await page.waitForLoadState('networkidle')
}

/** Clicks the first menu item card/link to open its detail page */
export async function openFirstItemDetail(page: Page) {
  // Prefer a test id if you have it
  const byTestId = page.locator('[data-testid="menu-item"], [data-testid="item-link"]').first()
  if (await byTestId.count()) {
    await byTestId.click()
    await page.waitForLoadState('networkidle')
    return
  }

  // Fallback: any link that looks like a detail route
  const byHref = page.locator('a[href*="/menuitem/"], a[href*="/item/"]').first()
  if (await byHref.count()) {
    await byHref.click()
    await page.waitForLoadState('networkidle')
    return
  }

  // Last resort: click the first heading/card
  const firstHeading = page.getByRole('heading').first()
  await firstHeading.click()
  await page.waitForLoadState('networkidle')
}

/** Clicks "Add to cart" on the item detail page */
export async function addToCartOnDetail(page: Page) {
  const byTestId = page.locator('[data-testid="add-to-cart"]').first()
  if (await byTestId.count()) {
    await byTestId.click()
    return
  }
  await page.getByRole('button', { name: /add to cart/i }).click()
}

/** Optional: open the cart page for the current handle/loc */
export async function openCart(page: Page, handle = HANDLE, loc = DEMO_LOC) {
  await page.goto(`/menus/${handle}/${loc}/cart`)
  await page.waitForLoadState('networkidle')
}
