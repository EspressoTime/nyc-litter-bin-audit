import { expect, test, type Page } from '@playwright/test'

const SOURCE_VERSION = '1794244182'

async function installDeterministicRoutes(page: Page): Promise<void> {
  await page.route('**/api/views/8znf-7b2c*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: '8znf-7b2c', rowsUpdatedAt: SOURCE_VERSION }),
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

async function openOfficialBasketDialog(page: Page): Promise<void> {
  const basketButton = page
    .getByRole('button', { name: /Not confirmed recently/ })
    .first()
  await expect(basketButton).toBeAttached()
  await basketButton.evaluate((element) => {
    ;(element as HTMLButtonElement).click()
  })
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function openLocalPinDialog(page: Page): Promise<void> {
  const canvas = page.locator('.basket-map canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) {
    throw new Error('The map canvas has no bounds.')
  }

  const points = [
    [0.25, 0.35],
    [0.75, 0.35],
    [0.25, 0.65],
    [0.75, 0.65],
  ] as const
  const dialog = page.getByRole('dialog', { name: 'Add basket pin' })

  for (const [xRatio, yRatio] of points) {
    const x = bounds.x + bounds.width * xRatio
    const y = bounds.y + bounds.height * yRatio
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.waitForTimeout(650)
    await page.mouse.up()

    if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
      return
    }
  }

  throw new Error('Could not open the local-pin dialog.')
}

type TrackedRequest = {
  body: string | null
  method: string
  url: string
}

function expectNoPrivateDataRequests(
  requests: TrackedRequest[],
  privateValues: string[] = [],
): void {
  const forbiddenFragments = [
    'exists',
    'missing',
    'local-observation',
    'local-pin',
    'basket_id',
    'observed_at',
    'last_seen_at',
    ...privateValues,
  ].map((value) => value.toLowerCase())

  const unexpectedRequests = requests.filter((request) => {
    const requestText = `${request.url} ${request.body ?? ''}`.toLowerCase()
    return (
      !['GET', 'HEAD'].includes(request.method) ||
      forbiddenFragments.some((fragment) => requestText.includes(fragment))
    )
  })

  expect(unexpectedRequests).toEqual([])
}

test('local observations never create network requests', async ({ page }) => {
  const requests: TrackedRequest[] = []
  page.on('request', (request) =>
    requests.push({
      body: request.postData(),
      method: request.method(),
      url: request.url(),
    }),
  )

  await openReadyApp(page)
  await openOfficialBasketDialog(page)
  requests.length = 0

  await page.getByRole('button', { name: 'Confirm Exists' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  expectNoPrivateDataRequests(requests)
})

test('local pin coordinates never create network requests', async ({ page }) => {
  const requests: TrackedRequest[] = []
  page.on('request', (request) =>
    requests.push({
      body: request.postData(),
      method: request.method(),
      url: request.url(),
    }),
  )

  await openReadyApp(page)
  await openLocalPinDialog(page)
  requests.length = 0

  const createDialog = page.getByRole('dialog', { name: 'Add basket pin' })
  await createDialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(createDialog).toBeHidden()
  await expect(page.locator('.basket-map[data-user-pin-count="1"]')).toBeVisible()

  expectNoPrivateDataRequests(requests, ['latitude', 'longitude'])
})

test('Locate me uses one request and never starts continuous tracking', async ({
  page,
}) => {
  await openReadyApp(page)

  await page.evaluate(() => {
    const calls = { getCurrentPosition: 0, watchPosition: 0 }
    Object.defineProperty(window, '__privacyLocationCalls', {
      configurable: true,
      value: calls,
    })
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          calls.getCurrentPosition += 1
          success({
            coords: { longitude: -73.9857, latitude: 40.7484 },
          } as GeolocationPosition)
        },
        watchPosition() {
          calls.watchPosition += 1
          return 1
        },
        clearWatch() {
          return undefined
        },
      },
    })
  })

  await page.getByRole('button', { name: 'Locate me' }).click()
  await expect(page.getByRole('button', { name: 'Locate me' })).toBeEnabled()

  const calls = await page.evaluate(() => {
    return (
      window as unknown as {
        __privacyLocationCalls: { getCurrentPosition: number; watchPosition: number }
      }
    ).__privacyLocationCalls
  })
  expect(calls).toEqual({ getCurrentPosition: 1, watchPosition: 0 })
})
