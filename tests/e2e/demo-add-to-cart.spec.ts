// tests/demo-add-to-cart.spec.ts
import { test, expect } from '@playwright/test'
import { goToMenu, openFirstItemDetail, addToCartOnDetail, openCart, HANDLE, DEMO_LOC } from '../helpers/menu'

test.use({ storageState: { cookies: [], origins: [] } })

test('demo: select item then add to cart', async ({ page }) => {
  await goToMenu(page, HANDLE, DEMO_LOC)
  await openFirstItemDetail(page)
  await addToCartOnDetail(page)

  await openCart(page, HANDLE, DEMO_LOC)

  // Assert there’s at least 1 item in cart (badge or line item)
  const badge = page.locator('[data-testid="cart-badge"]')
  if (await badge.count()) {
    await expect(badge).toBeVisible()
  } else {
    await expect(page.getByText(/subtotal|total/i)).toBeVisible()
  }
})
