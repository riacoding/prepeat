import { test, expect } from '@playwright/test'
import { config } from '@dotenvx/dotenvx'
config({ path: '.env.e2e', override: false })

const VENDOR_HANDLE = process.env.E2E_VENDOR_HANDLE || 'demo-truck'
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const E2E_TAX_RATE = process.env.E2E_TAX_RATE || 0

console.log('ENV E2E_BASE_URL raw =', JSON.stringify(process.env.E2E_BASE_URL))
console.log('Computed BASE_URL     =', JSON.stringify(BASE_URL))
console.log('E2E_TAX_RATE', E2E_TAX_RATE)

// match your seed — 1500 base cents + 200 + 150 = $18.50
const EXPECTED_PRE_TAX_TOTAL = (Number(process.env.E2E_BASE_PRICE_CENTS) || 1500) / 100 + 2.0 + 1.5
const EXPECTED_POST_TAX_TOTAL = EXPECTED_PRE_TAX_TOTAL * (1 + (Number(E2E_TAX_RATE) || 0) / 100)

test.describe('Menu meta, branding, and cart math', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/menus/${VENDOR_HANDLE}/demo-loc`)
  })

  test('should have correct meta tags and branding', async ({ page }) => {
    // Title
    await expect(page).toHaveTitle('Demo Truck-Menu of the Day')

    // Meta description
    const metaDesc = page.locator('meta[name="description"]')
    await expect(metaDesc).toHaveAttribute('content', 'Check out the latest offerings from our food truck!')

    // OG tags
    const ogTitle = page.locator('meta[property="og:title"]')
    await expect(ogTitle).toHaveAttribute('content', 'Demo Truck-Menu of the Day')

    // Visible branding
    await expect(page.getByText(/our menu/i)).toBeVisible()
  })

  test('should add item with toppings and calculate cart total correctly', async ({ page }) => {
    // Click on Margherita item
    await page
      .getByText(/margherita/i)
      .first()
      .click()

    // Select both toppings (by visible label text)
    await page.getByLabel(/add pepperoni/i).check()
    await page.getByLabel(/extra cheese/i).check()

    // Add to cart
    await page.getByRole('button', { name: /add to cart/i }).click()

    // Go to cart (depends on your UI — update selector as needed)
    const placeOrder = page.getByRole('button', { name: /place order/i })
    await expect(placeOrder).toBeEnabled()
    await placeOrder.click()

    // after placing order, it shows "Processing..." briefly
    await expect(page.getByRole('button', { name: /processing/i })).toBeVisible()

    // Cart total pre-tax
    const subTotalEl = page.locator('[data-testid="cart-subtotal"]')
    const subTotalText = await subTotalEl.textContent()
    expect(subTotalText).toMatch(/^\$\d+\.\d{2}$/)

    const numeric = parseFloat(subTotalText!.replace(/[^0-9.]/g, ''))
    expect(numeric).toBeCloseTo(EXPECTED_PRE_TAX_TOTAL, 2)

    //Cart total Post tax

    const subtotalDollars = parseFloat(subTotalText!.replace(/[^0-9.]/g, ''))
    const subtotalCents = Math.round(subtotalDollars * 100)

    // Use the tax rate you expect the app to be using.
    // Ideally, assert the label too: "Tax 8.75%" so you know the UI agrees.
    const rate = Number(process.env.E2E_TAX_RATE || 0) / 100
    const expectedTotalCents = subtotalCents + Math.round(subtotalCents * Number(E2E_TAX_RATE))
    const expectedTotalDollars = expectedTotalCents / 100

    // Now compare to the displayed total
    const totalEl = page.locator('[data-testid="cart-total"]')
    const totalText = await totalEl.textContent()
    const totalDollars = parseFloat(totalText!.replace(/[^0-9.]/g, ''))
    expect(totalDollars).toBeCloseTo(expectedTotalDollars, 2)
  })
})
