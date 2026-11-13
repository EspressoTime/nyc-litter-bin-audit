import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const distPath = resolve(process.cwd(), 'dist')
const manifestPath = resolve(distPath, 'manifest.webmanifest')
const bundledSnapshotPath = resolve(distPath, 'data', 'basket-inventory.json')
const serviceWorkerPath = resolve(distPath, 'sw.js')

if (!existsSync(manifestPath)) {
  throw new Error('Production manifest is missing. Run npm run build first.')
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const requiredManifestFields = [
  'name',
  'short_name',
  'start_url',
  'scope',
  'display',
  'theme_color',
  'background_color',
]

for (const field of requiredManifestFields) {
  if (!manifest[field]) {
    throw new Error(`Manifest is missing ${field}.`)
  }
}

if (
  manifest.start_url !== '/' ||
  manifest.scope !== '/' ||
  manifest.display !== 'standalone'
) {
  throw new Error('Manifest does not use the expected static PWA scope.')
}

for (const icon of manifest.icons ?? []) {
  const iconPath = resolve(distPath, icon.src.replace(/^\//, ''))
  if (!existsSync(iconPath)) {
    throw new Error(`Manifest icon is missing from the production package: ${icon.src}`)
  }
}

if (!existsSync(serviceWorkerPath)) {
  throw new Error('Generated service worker is missing from the production package.')
}

if (!existsSync(bundledSnapshotPath)) {
  throw new Error('Bundled inventory snapshot is missing from the production package.')
}

const serviceWorker = readFileSync(serviceWorkerPath, 'utf8')
if (!serviceWorker.includes('basket-inventory.json')) {
  throw new Error(
    'Bundled inventory snapshot is not included in the service-worker cache configuration.',
  )
}

console.log(
  JSON.stringify(
    {
      manifest: manifestPath,
      iconCount: manifest.icons?.length ?? 0,
      serviceWorker: 'dist/sw.js',
      bundledSnapshot: 'dist/data/basket-inventory.json',
      display: manifest.display,
      startUrl: manifest.start_url,
      scope: manifest.scope,
    },
    null,
    2,
  ),
)
