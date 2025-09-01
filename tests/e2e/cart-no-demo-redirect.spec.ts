import { test, expect } from '@playwright/test'

const HANDLE = process.env.HANDLE || 'italiafire'
const DEMO_LOC = process.env.DEMO_LOC || 'demo'
const REAL_LOC = process.env.REAL_LOC || 'regale'

test('select item -> add to cart (demo), then real vendor checkout stays on real', async ({ page }) => {
  // 1) Demo flow: open menu, click first item to detail, add to cart
  await page.goto(`/menus/${HANDLE}/${DEMO_LOC}`)
  await page.waitForLoadState('networkidle')

  // open first item detail (prefer test ids if you have them)
  const itemLink = page.locator('[data-testid="menu-item"], [data-testid="item-link"]').first()
  if (await itemLink.count()) {
    await itemLink.click()
  } else {
    // fallback: first link that looks like an item route or first heading
    const byHref = page.locator('a[href*="/menuitem/"], a[href*="/item/"]').first()
    if (await byHref.count()) await byHref.click()
    else await page.getByRole('heading').first().click()
  }
  await page.waitForLoadState('networkidle')

  // add to cart (detail page)
  const addBtn = page.locator('[data-testid="add-to-cart"]').first()
  if (await addBtn.count()) await addBtn.click()
  else await page.getByRole('button', { name: /add to cart/i }).click()

  // 2) Switch to real vendor, add another item via detail
  await page.goto(`/menus/${HANDLE}/${REAL_LOC}`)
  await page.waitForLoadState('networkidle')

  const realItemLink = page.locator('[data-testid="menu-item"], [data-testid="item-link"]').first()
  if (await realItemLink.count()) await realItemLink.click()
  else {
    const byHref = page.locator('a[href*="/menuitem/"], a[href*="/item/"]').first()
    if (await byHref.count()) await byHref.click()
    else await page.getByRole('heading').first().click()
  }
  await page.waitForLoadState('networkidle')

  const addBtnReal = page.locator('[data-testid="add-to-cart"]').first()
  if (await addBtnReal.count()) await addBtnReal.click()
  else await page.getByRole('button', { name: /add to cart/i }).click()

  // 3) Open the real cart and checkout
  await page.goto(`/menus/${HANDLE}/${REAL_LOC}/cart`)
  await page.waitForLoadState('networkidle')

  const checkout = page.locator('[data-testid="checkout-button"]')
  if (await checkout.count()) await checkout.click()
  else await page.getByRole('button', { name: /checkout/i }).click()

  // 4) Assert we did NOT get redirected to /demo
  await expect(page).not.toHaveURL(new RegExp(`/menus/${HANDLE}/${REAL_LOC}/demo`))
  await expect(page).toHaveURL(new RegExp(`/menus/${HANDLE}/${REAL_LOC}/`))
})
