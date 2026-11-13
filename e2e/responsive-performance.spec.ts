import { expect, test } from '@playwright/test'

test('renders a responsive NYC-wide map and records startup timings', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.locator('#app-title')).toBeVisible({ timeout: 3_000 })
  const shellInteractiveMs = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined
    return navigation ? performance.now() - navigation.responseStart : 0
  })

  const map = page.locator('.basket-map')
  const mapStartedAt = Date.now()
  await expect(map).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible()
  const mapVisibleMs = Date.now() - mapStartedAt

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined
    const mapElement = document.querySelector<HTMLElement>('.basket-map')
    const mapCanvas = document.querySelector<HTMLCanvasElement>('.basket-map canvas')
    const mapBounds = mapElement?.getBoundingClientRect()

    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      firstContentfulPaintMs:
        performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      mapWidth: mapBounds?.width ?? 0,
      mapHeight: mapBounds?.height ?? 0,
      canvasWidth: mapCanvas?.width ?? 0,
      canvasHeight: mapCanvas?.height ?? 0,
    }
  })

  await test.info().attach('performance-metrics.json', {
    body: JSON.stringify({ shellInteractiveMs, mapVisibleMs, ...metrics }, null, 2),
    contentType: 'application/json',
  })

  expect(shellInteractiveMs).toBeLessThan(3_000)
  expect(mapVisibleMs).toBeLessThan(15_000)
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.mapWidth).toBeGreaterThan(300)
  expect(metrics.mapHeight).toBeGreaterThan(400)
  expect(metrics.canvasWidth).toBeGreaterThan(0)
  expect(metrics.canvasHeight).toBeGreaterThan(0)
})
