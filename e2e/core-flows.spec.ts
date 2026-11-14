import { expect, test, type Page } from '@playwright/test'

const ISOLATED_BASKET = {
  label: 'ARTHUR KILL ROAD, Staten Island, NY, USA',
  latitude: 40.56505389,
  longitude: -74.18169655,
}

const SOURCE_VERSION = '1794244182'
const NYC_311_FORM_URL =
  'https://portal.311.nyc.gov/servicerequest-create/What?caid=794e51a3-3f16-ec11-b6e5-0022481cc62d&kasid=10a2780b-6161-ef11-bfe2-7c1e5217eb2d'

async function installDeterministicRoutes(page: Page): Promise<void> {
  await page.route('**/api/views/8znf-7b2c*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: '8znf-7b2c', rowsUpdatedAt: SOURCE_VERSION }),
    })
  })

  await page.route('https://geosearch.planninglabs.nyc/v2/**', async (route) => {
    const payload = {
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
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })
}

async function openReadyApp(page: Page): Promise<void> {
  await installDeterministicRoutes(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#app-title')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.basket-map canvas')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.basket-map[data-map-ready="true"]')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.locator('.basket-map[data-pin-layer-ready="true"]')).toBeVisible({
    timeout: 15_000,
  })
  await expect(
    page.locator('.basket-map[data-user-pin-layer-ready="true"]'),
  ).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible()
  await page.waitForTimeout(750)
}

async function selectIsolatedBasketLocation(page: Page): Promise<void> {
  const search = page.getByRole('combobox', { name: 'NYC address or place' })
  await search.fill('Arthur Kill Road')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 8_000 })
  await page.getByRole('button', { name: ISOLATED_BASKET.label }).click()
  await expect(page.getByRole('listbox')).toBeHidden()
  await page.waitForTimeout(4_000)
}

async function clickMapCenter(page: Page): Promise<void> {
  const canvas = page.locator('.basket-map canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) {
    throw new Error('The map canvas has no bounds.')
  }

  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  for (const offset of [0, -12, 12, -24, 24]) {
    await page.mouse.click(centerX + offset, centerY + offset)
    if (
      await page
        .getByRole('dialog')
        .isVisible({ timeout: 250 })
        .catch(() => false)
    ) {
      return
    }
  }
}

test('loads the full inventory, opens a basket, and persists Confirm Exists', async ({
  page,
}) => {
  await openReadyApp(page)

  const inventoryCount = await page.evaluate(async () => {
    const response = await fetch('/data/basket-inventory.json')
    const snapshot = (await response.json()) as { baskets: unknown[] }
    return snapshot.baskets.length
  })
  expect(inventoryCount).toBeGreaterThan(1_000)

  await selectIsolatedBasketLocation(page)
  await clickMapCenter(page)

  const dialog = page.getByRole('dialog', { name: 'ARTHUR KILL ROAD' })
  await expect(dialog).toBeVisible({ timeout: 8_000 })
  await expect(dialog).not.toContainText('50350014')

  await dialog.getByRole('button', { name: 'Confirm Exists' }).click()
  await expect(dialog).toBeHidden()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.basket-map canvas')).toBeVisible({ timeout: 15_000 })
  await selectIsolatedBasketLocation(page)
  await clickMapCenter(page)

  const persistedDialog = page.getByRole('dialog', { name: 'ARTHUR KILL ROAD' })
  await expect(persistedDialog).toBeVisible({ timeout: 8_000 })
  await expect(persistedDialog).toContainText('Current local status: 🚮')
})

test('continues to address search after denied location access', async ({ page }) => {
  await openReadyApp(page)

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          failure: PositionErrorCallback,
        ) => failure({ code: 1 } as GeolocationPositionError),
      },
    })
  })

  const locateButton = page.getByRole('button', { name: 'Locate me' })
  await locateButton.click()
  await expect(locateButton).toHaveAttribute('aria-label', 'Locate me')

  await selectIsolatedBasketLocation(page)
  await expect(page.getByRole('combobox')).toHaveValue(ISOLATED_BASKET.label)
})

test('reports a missing basket, copies the draft, and exposes the official 311 handoff', async ({
  page,
  context,
}) => {
  await openReadyApp(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(page.url()).origin,
  })
  await selectIsolatedBasketLocation(page)
  await clickMapCenter(page)

  const dialog = page.getByRole('dialog', { name: 'ARTHUR KILL ROAD' })
  await expect(dialog).toBeVisible({ timeout: 8_000 })
  await dialog.getByRole('button', { name: 'Report Missing' }).click()

  const draft = dialog.getByRole('textbox', { name: '311 complaint draft' })
  await expect(draft).toBeVisible()
  await expect(dialog).toContainText('This app has not submitted a complaint.')

  const handoff = dialog.getByRole('link', {
    name: 'Open official NYC 311 complaint form',
  })
  await expect(handoff).toHaveAttribute('href', NYC_311_FORM_URL)
  await expect(handoff).toHaveAttribute('target', '_blank')

  await dialog.getByRole('button', { name: 'Copy draft' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible({
    timeout: 5_000,
  })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.basket-map canvas')).toBeVisible({ timeout: 15_000 })
  await selectIsolatedBasketLocation(page)
  await clickMapCenter(page)
  const persistedDialog = page.getByRole('dialog', { name: 'ARTHUR KILL ROAD' })
  await expect(persistedDialog).toBeVisible({ timeout: 8_000 })
  await expect(persistedDialog).toContainText('Current local status: 🚨')
})

test('creates, manages, and removes a local pin after a long press', async ({
  page,
}) => {
  await openReadyApp(page)

  const canvas = page.locator('.basket-map canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) {
    throw new Error('The map canvas has no bounds.')
  }

  const point = {
    x: bounds.x + bounds.width * 0.25,
    y: bounds.y + bounds.height * 0.35,
  }
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.waitForTimeout(650)
  await page.mouse.up()

  const createDialog = page.getByRole('dialog', { name: 'Add basket pin' })
  await expect(createDialog).toBeVisible({ timeout: 5_000 })
  await createDialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(createDialog).toBeHidden()

  const manageDialog = page.getByRole('dialog', { name: 'Local basket pin' })
  await expect(page.locator('.basket-map[data-user-pin-count="1"]')).toBeVisible({
    timeout: 5_000,
  })
  await page.waitForTimeout(1_000)

  for (const [offsetX, offsetY] of [
    [0, 0],
    [-8, 0],
    [8, 0],
    [0, -8],
    [0, 8],
    [-16, 0],
    [16, 0],
    [0, -16],
    [0, 16],
  ]) {
    await page.mouse.click(point.x + offsetX, point.y + offsetY)
    if (await manageDialog.isVisible({ timeout: 300 }).catch(() => false)) {
      break
    }

    await page.touchscreen
      .tap(point.x + offsetX, point.y + offsetY)
      .catch(() => undefined)
    if (await manageDialog.isVisible({ timeout: 300 }).catch(() => false)) {
      break
    }
  }

  await expect(manageDialog).toBeVisible({ timeout: 5_000 })
  await expect(manageDialog).toContainText(
    'You confirmed seeing a litter basket here on',
  )

  await manageDialog
    .getByRole('button', { name: 'Reconfirm / update date last seen' })
    .click()
  await expect(manageDialog).toBeVisible()

  await manageDialog.getByRole('button', { name: 'Remove pin' }).first().click()
  await expect(manageDialog).toContainText('Remove this local 📍 pin')
  await manageDialog.getByRole('button', { name: 'Remove pin' }).last().click()
  await expect(manageDialog).toBeHidden()
})

test('keeps the cached map and local-only UI available when offline', async ({
  page,
  context,
}) => {
  await openReadyApp(page)
  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))

  await expect(page.locator('.offline-banner')).toContainText('You’re offline')
  await expect(page.locator('.basket-map')).toBeVisible()
  await expect(page.locator('.basket-map canvas')).toBeVisible()

  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
})
