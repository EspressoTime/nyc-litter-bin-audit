import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const SOURCE_VERSION = '1794244182'
const ISOLATED_BASKET = {
  label: 'ARTHUR KILL ROAD, Staten Island, NY, USA',
  latitude: 40.56505389,
  longitude: -74.18169655,
}

async function installDeterministicRoutes(page: Page): Promise<void> {
  await page.route('**/api/views/8znf-7b2c*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: '8znf-7b2c', rowsUpdatedAt: SOURCE_VERSION }),
    })
  })

  await page.route('https://geosearch.planninglabs.nyc/v2/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            id: 'isolated-basket-location',
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [ISOLATED_BASKET.longitude, ISOLATED_BASKET.latitude],
            },
            properties: { label: ISOLATED_BASKET.label, confidence: 0.99 },
          },
        ],
      }),
    })
  })
}

async function openReadyApp(page: Page): Promise<void> {
  await installDeterministicRoutes(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#app-title')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.basket-map canvas')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.locator('.basket-map[data-pin-layer-ready="true"]')).toHaveCount(
    1,
    { timeout: 15_000 },
  )
  await expect(
    page.locator('.basket-map[data-user-pin-layer-ready="true"]'),
  ).toHaveCount(1, { timeout: 15_000 })
  await page.waitForTimeout(750)
}

async function selectBasket(page: Page): Promise<void> {
  const search = page.getByRole('combobox', { name: 'NYC address or place' })
  await search.fill('Arthur Kill Road')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 8_000 })
  await page.getByRole('button', { name: ISOLATED_BASKET.label }).click()
  await expect(page.getByRole('listbox')).toBeHidden()
  const accessibleBasket = page
    .getByRole('button', { name: /^ARTHUR KILL ROAD:/ })
    .first()
  await expect(accessibleBasket).toBeAttached()
  await accessibleBasket.evaluate((element) => {
    ;(element as HTMLButtonElement).click()
  })
  await expect(page.getByRole('dialog', { name: 'ARTHUR KILL ROAD' })).toBeVisible()
}

async function expectNoAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .exclude('.basket-map-accessible-list')
    .analyze()
  expect(results.violations, context).toEqual([])
}

test('primary map screen passes automated accessibility checks', async ({ page }) => {
  await openReadyApp(page)
  await expectNoAxeViolations(page, 'map screen')
  await expect(
    page.getByRole('button', { name: /Not confirmed recently/ }).first(),
  ).toBeAttached()
})

test('basket details and 311 handoff pass automated accessibility checks', async ({
  page,
}) => {
  await openReadyApp(page)
  await selectBasket(page)
  const dialog = page.getByRole('dialog', { name: 'ARTHUR KILL ROAD' })
  await expect(dialog).toBeVisible()
  await expectNoAxeViolations(page, 'basket details dialog')

  await dialog.getByRole('button', { name: 'Report Missing' }).click()
  await expect(
    dialog.getByRole('textbox', { name: '311 complaint draft' }),
  ).toBeVisible()
  await expectNoAxeViolations(page, '311 report handoff')
})

test('local-pin creation dialog passes automated accessibility checks', async ({
  page,
}) => {
  await openReadyApp(page)

  const canvas = page.locator('.basket-map canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) {
    throw new Error('The map canvas has no bounds.')
  }

  const x = bounds.x + bounds.width * 0.25
  const y = bounds.y + bounds.height * 0.35
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(650)
  await page.mouse.up()

  const dialog = page.getByRole('dialog', { name: 'Add basket pin' })
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await expectNoAxeViolations(page, 'local-pin creation dialog')
})
