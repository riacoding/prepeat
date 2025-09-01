// tests/cart-namespace-isolation.spec.ts
import { test, expect, Page } from '@playwright/test'

const REAL_HANDLE = process.env.HANDLE || 'italiafire'
const DEMO_HANDLE = process.env.HANDLE || 'prepeat'
const DEMO_LOC = process.env.DEMO_LOC || 'demo'
const REAL_LOC = process.env.REAL_LOC || 'regale'

const demoKey = `cartItems:${DEMO_HANDLE}:${DEMO_LOC}`
const realKey = `cartItems:${REAL_HANDLE}:${REAL_LOC}`

async function openFirstItemDetail(page: Page) {
  const byTestId = page.locator('[data-testid="menu-item"], [data-testid="item-link"]').first()
  if (await byTestId.count()) return byTestId.click()

  const byHref = page.locator('a[href*="/menuitem/"], a[href*="/item/"]').first()
  if (await byHref.count()) return byHref.click()

  // last-resort fallback
  return page.getByRole('heading').first().click()
}

async function addToCartOnDetail(page: Page) {
  const addBtn = page.locator('[data-testid="add-to-cart"]').first()
  if (await addBtn.count()) return addBtn.click()
  return page.getByRole('button', { name: /add to cart/i }).click()
}

const getLS = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key)

test('namespaced carts: demo and real are isolated', async ({ page }) => {
  // 1) DEMO: add an item (creates cartItems:prepeat:demo)
  await page.goto(`/menus/${DEMO_HANDLE}/${DEMO_LOC}`)
  await page.waitForLoadState('networkidle')
  await openFirstItemDetail(page)
  await page.waitForLoadState('networkidle')
  await addToCartOnDetail(page)

  const legacy = await getLS(page, 'cartItems')
  expect(legacy, 'legacy cartItems key should not be used').toBeNull()

  const demoAfter = await getLS(page, demoKey)
  expect(demoAfter, `expected ${demoKey} to be populated after adding to demo`).toBeTruthy()

  // real key should not exist yet
  const realBefore = await getLS(page, realKey)
  expect(realBefore, `expected ${realKey} to be empty before real add`).toBeNull()

  // 2) REGALE: add an item (creates cartItems:italiafire:regale)
  await page.goto(`/menus/${REAL_HANDLE}/${REAL_LOC}`)
  await page.waitForLoadState('networkidle')
  await openFirstItemDetail(page)
  await page.waitForLoadState('networkidle')
  await addToCartOnDetail(page)

  const realAfter = await getLS(page, realKey)
  expect(realAfter, `expected ${realKey} to be populated after adding to real`).toBeTruthy()

  // 3) Ensure the demo key is unchanged and different from the real key
  const demoStill = await getLS(page, demoKey)
  expect(demoStill, `expected ${demoKey} to remain unchanged`).toBe(demoAfter)
  expect(realAfter, 'demo and real carts should be independent').not.toBe(demoAfter)

  // 4) Optional: assert real cart page doesn’t leak to /demo
  await page.goto(`/menus/${REAL_HANDLE}/${REAL_LOC}/cart`)
  await page.waitForLoadState('networkidle')
  await expect(page).not.toHaveURL(new RegExp(`/menus/${DEMO_HANDLE}/${REAL_LOC}/demo`))
})
