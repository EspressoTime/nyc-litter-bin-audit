# NYC Litter Basket Locator

Mobile-first PWA for browsing official NYC DSNY litter basket locations and preparing missing-basket 311 reports.

## Local development

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite.

## Validation

```powershell
npm run check
npm run build
```

`npm run check` runs formatting, ESLint, TypeScript, and Vitest. `npm run build` creates the production bundle in `dist/`.

To verify the generated PWA manifest, install-sized icons, and service worker:

```powershell
npm run pwa:smoke
```

To verify the live, read-only Socrata endpoint and response shape:

```powershell
npm run data:smoke
```

To regenerate the bundled, normalized inventory snapshot from the complete Socrata dataset:

```powershell
npm run data:snapshot
```

The generated snapshot is included at `public/data/basket-inventory.json` and contains only normalized inventory records plus private source-version metadata. It is the first-time/off-schedule inventory fallback; local caching and scheduled replacement are implemented separately.

To verify the live, read-only NYC GeoSearch endpoints and GeoJSON response shape:

```powershell
npm run geosearch:smoke
```

## Static hosting

The default deployment target is Vercel. The project is configured as a static Vite deployment:

- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: all application routes rewrite to `index.html`
- Hashed assets: cached immutably
- Service worker files: revalidated without a long-lived cache

The MVP has no application backend, database, serverless function, account flow, or remote observation store. User observations remain in browser-local storage.

The default map style is OpenFreeMap Bright through MapLibre GL JS. It does not require a client API key; map attribution remains enabled and the style provider is replaceable.

No deployment or external account connection is performed by the local project configuration.
