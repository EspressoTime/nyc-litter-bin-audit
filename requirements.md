# NYC Litter Basket Locator and 311 Reporting PWA

**Status:** Draft requirements for MVP
**Last reviewed:** 2026-11-10
**Primary source:** DSNY Litter Basket Inventory, NYC Open Data dataset `8znf-7b2c`

## 1. Product definition

This product is a mobile-first progressive web app that makes official NYC Department of Sanitation (DSNY) litter-basket locations easy to browse. A resident can see all official basket pins on an interactive map, search by current location or NYC address, inspect official basket details, and record either “Confirm Exists” or “Report Missing.”

The app is a navigation and reporting aid. It must clearly distinguish official inventory data from user observations and must never imply that a basket is confirmed by DSNY merely because it appears on the map.

### 1.1 Product goals

1. Make the official DSNY basket inventory understandable without requiring users to navigate NYC Open Data.
2. Let a user quickly determine whether an expected basket is near their current location or searched address.
3. Make a missing-basket 311 report easier to prepare and submit through the official NYC 311 channel.
4. Capture lightweight user observations that help the user remember which locations they recently checked.

### 1.2 MVP scope

The MVP includes:

- PWA installation and mobile-first responsive layout.
- Interactive map showing all currently available official basket pins.
- Browser geolocation with a manual fallback.
- NYC address/place search.
- Basket detail view using official inventory fields.
- “Confirm Exists” and “Report Missing” user flows.
- Long-press map placement of local “Saw Basket Here” pins at locations that may not have an official inventory pin.
- Emoji-only pins based on the current user’s latest observation:
  - **🗑️:** unconfirmed, including never checked or a confirmation older than 30 days.
  - **🚮:** confirmed exists by this user within the previous 30 days.
  - **🚨:** reported missing by this user and not superseded by a later confirmation.
- Emoji-only **📍** pins for locally saved user-seen basket locations, with local confirmation date, reconfirmation, and removal controls.
- Prefilled report text, clipboard copy, and link to the official NYC 311 complaint submission form.
- A bundled or locally cached official inventory snapshot, with monthly Socrata update detection beginning on the 7th and local replacement only after a newer dataset version is confirmed.
- Local user data only; no account creation, backend, or cross-device synchronization.

### 1.3 Explicit non-goals for MVP

- Automated submission of a 311 complaint.
- Claiming that a user observation is an official DSNY determination.
- Full community consensus or reputation scoring.
- User profiles, following, messaging, gamification, or leaderboards.
- Photo uploads.
- Continuous location tracking.
- Inventory for recycling bins, all Parks bins, or every basket owned by another agency.

### 1.4 Assumptions and decisions

- The earlier product direction is retained: React + TypeScript, MapLibre GL JS, browser storage, and static hosting.
- MVP has no application backend. The browser loads a bundled/local inventory snapshot, checks Socrata once daily for an update beginning on the 7th of each month, and fetches/replaces the local inventory only after a newer dataset version is confirmed. User observations and user-added basket pins are stored locally on that user’s device/browser profile.
- “By the user” means the current local user profile on the current device/browser. Community-wide aggregation, accounts, and cross-device history are intentionally deferred.
- A user-added **📍** pin is a local observation that a basket was seen at a user-selected map coordinate; it is not an official DSNY inventory record and does not modify or supplement the official inventory dataset.
- All five boroughs are in scope from the first release.
- The map shows all official inventory pins after the inventory load completes. The implementation may use a local normalized cache for performance, but Socrata remains the authoritative official-data source.

## 2. Personas

### P-001 — Resident or pedestrian

Wants to know whether a litter basket should be present near a location while walking around NYC. May not know the basket ID or how NYC Open Data works.

### P-002 — Civic reporter

Has found a basket missing and wants to prepare an accurate NYC 311 report with minimal typing. Needs the official location context and a clear handoff to 311.

### P-003 — Neighborhood checker

Periodically checks nearby baskets and wants a simple visual reminder of which locations they recently confirmed. May use the PWA on a phone with inconsistent connectivity.

### P-004 — Product/data maintainer

Needs to monitor Socrata data freshness, query failures, invalid coordinates, local storage behavior, and map performance without changing official inventory records manually.

## 3. User flows

### UF-001 — Open and locate nearby baskets

1. User opens the PWA.
2. App loads the map and official basket inventory.
3. App requests location permission with a plain-language explanation.
4. If permission is granted, the map centers on the user and displays all pins.
5. If permission is denied or unavailable, the map opens at NYC-wide extent and remains fully usable through pan, zoom, and search.
6. User can select “Locate me” later without reloading the app.

### UF-002 — Search for an address or place

1. User enters an NYC address or place name.
2. App presents debounced autocomplete suggestions.
3. User selects a result.
4. App centers the map on the selected coordinate and preserves the full basket layer.
5. User can browse nearby pins or continue panning and zooming.
6. If no result is found, the app explains how to try a street address, intersection, or place name.

### UF-003 — Inspect an official basket

1. User taps or selects a pin.
2. App opens a detail card or bottom sheet without losing the map context.
3. Detail view shows official basket fields, source attribution, and current-user observation status.
4. User can close the detail view, navigate to the pin, confirm it exists, or report it missing.

### UF-004 — Confirm exists

1. User selects “Confirm Exists” from the basket detail view.
2. App immediately saves an `exists` observation to the current user’s local browser storage.
3. The pin changes to 🚮 immediately and the detail view displays the confirmation date.
4. The confirmation remains 🚮 for 30 days unless the user later reports the basket missing.

### UF-005 — Report missing and prepare 311 handoff

1. User selects “Report Missing.”
2. App immediately saves a `missing` observation to the current user’s local browser storage.
3. The pin changes to 🚨 immediately.
4. App generates a concise complaint description, copies it to the clipboard when permitted, and exposes the official NYC 311 complaint submission form link.
5. App tells the user that the complaint is not submitted by this app and must be completed on NYC 311.

### UF-006 — Offline or degraded network

1. User opens the app with a previously cached shell and inventory.
2. App indicates offline or stale mode.
3. User can browse cached baskets and prior observation statuses.
4. New observations are saved locally and do not require network access.
5. When connectivity returns, the app may refresh official inventory data, but it never uploads local observations.
6. If the inventory has never been cached, the app provides a retry action and does not show fabricated pins.

### UF-007 — Add and manage a local “Saw Basket Here” pin

1. User presses and holds at any map location for the long-press threshold without moving beyond the gesture tolerance.
2. App opens a confirmation dialog asking, “Did you see a litter basket at this location?”
3. User selects “Confirm.”
4. App saves a local user-added pin at the selected coordinate with the current `last_seen_at` date and renders it with the **📍** emoji.
5. User selects the **📍** pin.
6. App opens the local-pin dialog showing the date it was previously confirmed.
7. User can select “Remove pin” to delete the local pin, or “Reconfirm / update date last seen” to save the current date and keep the **📍** pin.
8. The local pin and its date persist across reloads and remain available offline; no network request or backend write is made.

## 4. Functional requirements

Each requirement has a stable ID and testable acceptance criteria.

### FR-001 — PWA shell and installability

The application shall be installable as a PWA on supported mobile and desktop browsers.

**Acceptance criteria**

- Given a supported browser, when the app is loaded over HTTPS, then the app provides a valid manifest, icons, theme colors, and service worker registration.
- Given the browser supports installation, when installability requirements are met, then the user can install the app through the browser’s normal install affordance.
- Given the app shell is cached, when the user reopens the app offline, then the shell renders an offline state instead of a blank page.

### FR-002 — Interactive map

The application shall provide pan, zoom, recenter, and pin selection. Basket pins on the map shall be emoji-only with no visible text labels.

**Acceptance criteria**

- Given valid inventory data, when the map renders, then every valid basket record in the loaded inventory has one selectable map representation.
- When the user pans or zooms, then the map remains responsive and the selected detail view does not display data for a different pin.
- Each basket marker displays exactly one status emoji: 🗑️, 🚮, or 🚨.
- Emoji glyphs use the selected Noto Color Emoji web font with a system emoji fallback, with no background circle or border behind the glyph.
- Basket IDs, street names, status words, and other application text are not rendered as labels on the map; they appear only in dialogs or other non-map UI. The basket ID is specifically excluded from the basket details dialog.
- The floating search bar reserves space for the map zoom controls, and all map controls remain visible at supported screen sizes.
- “Locate me” is an icon-only `𖦏` control inside the existing MapLibre navigation control group with the zoom and compass buttons; no separate overlay control or “Add pin” button is displayed.

### FR-003 — All official basket pins

The application shall show all valid basket records from the current official inventory, not only a manually selected sample.

**Acceptance criteria**

- Given a successful full inventory load, then the client receives and renders the complete set of valid records returned by the browser data loader.
- Records with missing or invalid coordinates are excluded from map rendering, counted in local diagnostics, and not silently treated as real locations.
- The UI does not display source refresh timestamps or source freshness values.

### FR-004 — Current location

The application shall support optional browser geolocation.

**Acceptance criteria**

- The app asks for location only after a user action or clear location-purpose prompt.
- When permission is granted, the map centers on the returned coordinate and shows a user-location indicator.
- When permission is denied, unavailable, or times out, the app remains usable and explains the manual-search alternative.
- The app does not continuously track or retain a user’s location history.

### FR-005 — NYC address/place search

The application shall provide address and place search using an NYC-focused geocoding adapter.

**Acceptance criteria**

- When the user types a query, the app debounces requests and shows matching NYC suggestions.
- When a suggestion is selected, the app centers the map on its GeoJSON coordinate and preserves the basket layer.
- Search matching is case-insensitive, tolerant of repeated whitespace and punctuation, ranks the closest provider matches first, and supports short partial numeric address tokens (for example, `9053 1` can surface `9053 176`).
- Search failures, empty results, and non-NYC results produce understandable recovery guidance.
- Search status guidance is shown only for an active search interaction and clears when a result is selected or the user uses the map’s Locate me control.
- The geocoder provider is isolated behind an adapter so it can be replaced without changing map or basket code.

### FR-006 — Pin glyph semantics

The application shall calculate a viewer-scoped status for every basket.

**Acceptance criteria**

- If the current user’s latest unsuperseded observation is `missing`, the pin is 🚨.
- Else, if the current user’s latest `exists` observation is less than or equal to 30 calendar days old, the pin is 🚮.
- Else, the pin is 🗑️.
- A later observation always supersedes an earlier observation for that user and basket.
- Each emoji pin has an accessible label, for example “Confirmed exists 12 days ago,” “Reported missing today,” or “Not confirmed recently,” even though those labels are not rendered on the map.
- Date calculations use one documented timezone rule, preferably America/New_York, and are covered by boundary tests at 29, 30, and 31 days.

### FR-007 — Basket detail view

The application shall show official details for a selected basket.

**Acceptance criteria**

- The compact detail view displays the selected street context, current local observation status, latest observation date when present, available actions, and official source attribution.
- The detail view does not display `basketid`.
- The detail view does not render a `basket-details-list`, `dialog-note`, or `eyebrow` element.
- The detail view shows the user’s latest observation and available actions.

### FR-008 — Confirm Exists

The application shall let the current user record that a basket is present.

**Acceptance criteria**

- Clicking “Confirm Exists” immediately attempts the local observation write without a secondary confirmation button.
- A successful local save creates exactly one `exists` observation for the selected basket and observation timestamp.
- On success, the map and detail view update to 🚮 without a full page reload.
- After a successful local save, the basket details modal dismisses automatically.
- The UI displays the observation date and explains that 🚮 means this user confirmed the location within 30 days.
- If the write fails, the UI retains the prior status and offers retry; it does not claim success.

### FR-009 — Report Missing

The application shall let the current user record that an official basket was not found at the listed location.

**Acceptance criteria**

- Clicking “Report Missing” immediately attempts the local observation write without a secondary confirmation button.
- A successful local save creates exactly one `missing` observation for the selected basket and observation timestamp.
- On success, the map and detail view update to 🚨 without a full page reload.
- The UI uses “reported missing” language and does not state that DSNY has confirmed removal.
- A failed write retains the prior status and exposes a retryable error without claiming success.

### FR-010 — 311 report preparation

The application shall prepare a report handoff without pretending to submit the 311 request.

**Acceptance criteria**

- Generated text includes the observation date, basket ID when available, street/intersection context, borough when available, and an explicit request to investigate or replace the missing litter basket.
- The user can copy the generated text using the Clipboard API or a visible manual-copy fallback.
- If clipboard access is unavailable or denied, the complete draft remains visible in an editable text field with instructions for manual copying.
- The app opens the configured official NYC 311 complaint submission form.
- The app explicitly says that the user must review and submit the request on NYC 311.
- If clipboard or popup access is blocked, the generated text remains visible and the 311 link remains usable.

### FR-011 — Official source attribution

The application shall identify the official inventory source without displaying source freshness or location-accuracy disclosures.

**Acceptance criteria**

- The app identifies the source as the NYC Open Data DSNY Litter Basket Inventory and links to the dataset.
- The app explains that user observations are not official DSNY records.
- The UI does not display a source refresh timestamp, source freshness value, or location-accuracy disclosure.

### FR-012 — Loading, empty, and error states

The application shall provide recoverable states for map and data failures.

**Acceptance criteria**

- During initial load, the UI shows progress without blocking the browser indefinitely.
- During the scheduled update-check window, a timeout or API failure leaves the prior snapshot intact and shows a recoverable refresh error; it does not result in an empty map being presented as authoritative or trigger an extra same-day check.
- If zero valid records are returned, the UI distinguishes “no data returned” from “no baskets exist.”
- Search and observation errors identify the failed action and preserve the user’s current map context.

### FR-013 — Accessible map alternatives

The application shall remain usable for people who cannot operate the map visually or precisely.

**Acceptance criteria**

- All controls have accessible names and visible keyboard focus.
- A selected basket can be reached through a search result or map pin; the app does not display a separate basket-directory section.
- Status is conveyed by the prescribed emoji and an accessible text label.
- Modals and bottom sheets have correct focus management and can be dismissed with the keyboard.
- Automated accessibility checks and manual keyboard checks pass for the primary flows.

### FR-014 — Local user data storage

The application shall store MVP user observations and user-added basket pins only in browser-local storage for the current device/browser profile.

**Acceptance criteria**

- After a successful “Confirm Exists,” “Report Missing,” or local-pin confirmation action, the data persists across page reloads and browser restarts on the same device/browser profile.
- Observation records and user-added pin records are not sent to the application owner, Socrata, NYC 311, the geocoder, or any other remote service.
- The map page does not display a separate local-data details or clear-data section; local observations and pins remain browser-local.
- If browser storage is unavailable or full, the app explains that the observation or pin could not be saved and does not claim success.
- Clearing site data or using a different browser/device is documented as removing or not carrying over local observation and user-added-pin history.

### FR-015 — User-added local “Saw Basket Here” pins

The application shall let the current user add a local pin anywhere on the map to record that they saw a litter basket at that location.

**Acceptance criteria**

- A long press held for at least 500 milliseconds without moving more than 8 CSS pixels opens a confirmation dialog at the selected map coordinate. The thresholds are configurable constants in the map interaction layer.
- The gesture is cancelled when the pointer moves beyond the tolerance, the pointer is released before the threshold, a second pointer is introduced, or the map is otherwise in a conflicting interaction state.
- The confirmation dialog asks, “Did you see a litter basket at this location?” and provides a clearly labeled “Confirm” button plus a way to cancel without saving.
- After confirmation, the app saves one local user-added pin and renders it using only the rounded pushpin emoji **📍** on the map; no text label is rendered on the map.
- A user-added **📍** pin is distinct from official DSNY inventory pins and does not require or display a `basketid`.
- Selecting a user-added **📍** pin opens a local-pin dialog that shows the date it was previously confirmed and provides “Remove pin” and “Reconfirm / update date last seen” actions.
- “Remove pin” requires confirmation before deleting the local pin and removes it from the map after a successful local delete.
- “Reconfirm / update date last seen” updates `last_seen_at` to the current date using the documented America/New_York calendar-day rule and keeps the **📍** pin visible.
- The pin and date persist across reloads, browser restarts, and offline use on the same device/browser profile.
- Adding, reconfirming, or removing a user-added pin never sends its coordinate or date to an application-owned service, Socrata, NYC 311, or the geocoder.
- Storage failures preserve the prior map state and explain that the pin could not be saved or removed; the UI never claims success when the local write fails.
- The local-pin dialog does not display source freshness or location-accuracy disclosures.

### FR-016 — Popup modal dismissal

The application shall let users dismiss every popup modal by clicking the overlay outside the modal content.

**Acceptance criteria**

- Clicking the backdrop outside an open modal dismisses that modal when no local save is actively in progress.
- Clicking inside the modal content does not dismiss the modal or trigger the backdrop action.
- Official basket details, Report Missing review/draft, local-pin creation, and local-pin management dialogs all support outside-overlay dismissal.
- Existing close, cancel, and Escape-key dismissal behavior remains available.
- Dismissing a modal before confirmation does not save or modify local observations, local pins, or report drafts.
- Outside-overlay dismissal changes only modal visibility; it does not reload, recreate, or modify the underlying map, loaded inventory, viewport, or selected background context.

### FR-017 — Responsive compact map interface

The application shall keep the primary map controls visible and use a compact interaction surface on supported screen sizes.

**Acceptance criteria**

- The floating address search bar does not overlap the map zoom controls at supported viewport widths.
- The “Locate me” control uses the `𖦏` crosshairs icon, has an accessible name, and is a button inside the existing `maplibregl-ctrl maplibregl-ctrl-group` alongside the zoom and compass controls.
- No standalone “Add pin” button is displayed; local pin placement remains available through the long-press map flow.
- No “Your location is centered on the map.” status paragraph is rendered.
- No basket-directory details section or standalone local-data details section is rendered or maintained by the page UI.
- No `map-selection` status paragraph is rendered or maintained after a basket is selected; selection context is communicated through the details modal.
- Selecting an address from the search suggestions closes the suggestion list after selection.
- The basket details modal is compact: it omits the `basket-details-list`, `dialog-note`, and `eyebrow` elements.
- “Confirm Exists” and “Report Missing” perform their local actions directly without a secondary confirmation control.
- The official NYC 311 link remains a usable native external link; clicking it is not prevented by the modal backdrop.
- Official and local emoji pins use Noto Color Emoji with a system emoji fallback and no background circle or border.
- The header does not render the `app-kicker`, `app-subtitle`, or `app-location-count` elements.
- The page title is “🗑️ NYC Litter Binventory 🗑️.”
- An about section below the map displays: “NYC Litter Binventory helps identify and report missing litter baskets around NYC. Collaborative features coming soon :)” using the former subtitle styling.
- The application accent color is `#046307`, including primary action buttons, links, active/focus states, and other non-semantic accent treatments.
- Header text uses Fraunces, and body copy and controls use Source Sans 3, with local system fallbacks if the web fonts are unavailable.

## 5. Data and API requirements

### DATA-001 — Official dataset contract

The integration shall use dataset `8znf-7b2c`, DSNY Litter Basket Inventory, as the official inventory source.

The current published schema includes these fields:

| API field | Use | Required for map |
|---|---|---:|
| `basketid` | Stable basket-location identifier | Yes when present |
| `baskettype` | Owner and physical basket type | No |
| `direction` | Corner or side-of-street direction | No |
| `streetname1` | Primary street or on-street name | No |
| `streetname2` | Cross street at an intersection | No |
| `objectid` | Feature identifier | No |
| `latitude` | WGS84 latitude | Yes |
| `longitude` | WGS84 longitude | Yes |
| `borough` | Borough | No |
| `district` | DSNY/community district | No |
| `point` | Socrata point geometry | No; derive from lat/lon if needed |

**Acceptance criteria**

- The ingestion layer maps API field names explicitly rather than relying on column order.
- Required coordinates are parsed as finite numbers and validated against NYC-reasonable latitude/longitude bounds.
- The normalized basket model retains the raw source identifiers and source payload version needed for diagnostics.
- A schema mismatch produces a visible ingestion alert and does not silently publish an empty or malformed inventory.

### DATA-002 — API endpoints and query format

The implementation shall keep the dataset identifier and endpoint configurable in one client data-loader module.

Default resource endpoint:

```text
https://data.cityofnewyork.us/resource/8znf-7b2c.json
```

The implementation team shall verify the endpoint version and preferred query method in the dataset’s Foundry documentation before production. If the current Foundry page exposes SODA 3 query endpoints, the browser data loader may use that documented endpoint; retain the resource endpoint as a compatibility and diagnostic path.

**Acceptance criteria**

- No dataset identifier or API host is duplicated throughout UI code.
- The browser data loader supports JSON responses and records local diagnostics for HTTP status, latency, response size, and refresh time.
- The application can switch endpoint configuration without changing map or feature code; a static-app rebuild is acceptable.
- The MVP does not depend on a private credential. If a public Socrata app token is later used to improve public-client throttling, it is treated as non-secret client configuration and is never used to authorize access to private data.

### DATA-003 — Handling more than 1,000 rows

The implementation shall use the documented Socrata solution for datasets larger than the default 1,000-row response.

#### Preferred bulk request

For the current inventory size and a SODA 2.x resource endpoint, request a deterministic, projected result with an explicit limit that is higher than 1,000 and within the endpoint’s documented maximum:

```text
GET https://data.cityofnewyork.us/resource/8znf-7b2c.json
  ?$select=basketid,baskettype,direction,streetname1,streetname2,objectid,latitude,longitude,borough,district,point
  &$order=basketid
  &$limit=50000
```

The `$limit` value must be configured, not hard-coded in multiple places. The official Socrata guidance documents a default of 1,000 rows, a 50,000-row maximum for SODA 2.0, and no upper limit for SODA 2.1/3.0 endpoints, subject to endpoint documentation and practical timeout/payload limits.

#### Portable pagination fallback

If the explicit high limit is rejected, truncated, times out, or the dataset grows beyond the safe limit, page through the dataset with `$limit=1000` and `$offset` increments of 1,000:

```text
GET .../resource/8znf-7b2c.json?$order=basketid&$limit=1000&$offset=0
GET .../resource/8znf-7b2c.json?$order=basketid&$limit=1000&$offset=1000
GET .../resource/8znf-7b2c.json?$order=basketid&$limit=1000&$offset=2000
```

Stop when a page returns fewer than 1,000 rows. Dedupe by `basketid` when present and use a deterministic order on every page. Do not stop after the first 1,000 rows.

#### SODA 3 path

If the Foundry documentation identifies the dataset as SODA 3, the ingestion adapter may use its documented query endpoint and `pageNumber`/`pageSize` request model. The adapter must still verify the returned count and continue until all pages are consumed.

**Acceptance criteria**

- A test fixture containing more than 1,000 rows produces more than 1,000 normalized baskets in the browser data loader.
- A mocked API that returns exactly 1,000 rows for page 1 and 237 rows for page 2 produces 1,237 records and stops after page 2.
- A mocked API that rejects `$limit=50000` automatically uses the pagination fallback.
- A retry does not duplicate records.
- The local diagnostic view or test output records requested page/offset, received row count, cumulative unique row count, and termination reason.
- The production map never silently renders only the first 1,000 records.

### DATA-004 — Optional viewport query

The browser data loader may support a bounding-box query for future performance optimization, but the first release must still satisfy the all-pins requirement.

Example SoQL shape:

```text
?$select=...
&$where=latitude between {minLat} and {maxLat}
  and longitude between {minLon} and {maxLon}
&$order=basketid
&$limit=50000
```

**Acceptance criteria**

- When viewport querying is enabled, every returned record lies within the requested bounds, subject to documented boundary precision.
- Panning does not remove previously loaded pins unless the UI explicitly indicates a viewport-only mode.
- The data layer has one consistent source of truth for deduplication between full-inventory and viewport responses.

### DATA-005 — Client-side inventory normalization and freshness

The browser data loader shall normalize official records into an internal model and retain freshness metadata locally.

Recommended internal model:

```ts
type Basket = {
  id: string;                 // basketid, fallback objectid only when necessary
  objectId?: string;
  basketType?: string;
  direction?: string;
  streetName1?: string;
  streetName2?: string;
  latitude: number;
  longitude: number;
  borough?: string;
  district?: string;
  sourceDataset: "8znf-7b2c";
  sourceFetchedAt: string;
  sourceUpdatedAt?: string;
};
```

**Acceptance criteria**

- A normalized record always contains `id`, finite coordinates, source dataset ID, and fetch timestamp.
- Source records that cannot be normalized are counted and sampled in diagnostics.
- A successful refresh records locally the number of source rows, valid rows, invalid rows, duplicate rows, and the source update timestamp when available.
- Local metadata retains the last successful refresh even if a later refresh fails; this metadata is not displayed in the UI.

### DATA-006 — Local user observations

The application shall store observations separately from official inventory in browser-local storage, preferably IndexedDB with a small localStorage fallback for status metadata.

Recommended fields:

```text
local_observation_id, basket_id, status, observed_at, created_at,
source="local"
```

`status` is `exists` or `missing`; `observed_at` is the user-confirmed observation time; `local_observation_id` identifies the local record.

**Acceptance criteria**

- An observation never overwrites the official basket record.
- Saving an observation does not modify the official basket record.
- The local status query returns only the latest applicable observation for the current user and basket.
- The local record shape leaves room for future `damaged`, `overflowing`, photo, moderation, and community-confidence fields without changing the official inventory model.
- No local observation is uploaded automatically or synchronized to another device.

### DATA-008 — Local user-added basket pins

The application shall store user-added “Saw Basket Here” pins separately from both the official inventory and the official-basket observation records.

Recommended fields:

```text
local_pin_id, latitude, longitude, last_seen_at, created_at,
updated_at, source="local", kind="user_seen_basket"
```

`latitude` and `longitude` are the coordinate selected by the user’s long press. `last_seen_at` is the date the user most recently confirmed seeing a basket at that coordinate.

**Acceptance criteria**

- A local pin record contains a finite latitude and longitude, a stable local ID, a creation timestamp, and a `last_seen_at` value.
- A local pin is stored in the local browser profile and is never merged into, written back to, or used to replace the official DSNY inventory.
- Reconfirmation updates only the local pin’s `last_seen_at` and `updated_at` values; it does not create an official-basket observation or change an official pin’s glyph.
- Removing a pin deletes the local pin record after the user confirms deletion.
- Local pins are restored from browser storage on reload and remain available when the app is offline.
- Local pin coordinates and dates are never uploaded or synchronized automatically.

### DATA-007 — Monthly official-inventory update detection and refresh

Beginning on the 7th day of each calendar month, using America/New_York as the scheduling timezone, the app shall check Socrata at most once per day for evidence that the DSNY inventory dataset has updated. The app shall continue this daily check until a newer dataset version is confirmed or the month ends.

The daily check shall first inspect dataset metadata or an equivalent version/update marker. It shall not download the full row set when the API reports that the source version is unchanged. The app may fetch the full row set only after confirming that the API reports a newer version than the locally applied version. After a successful full fetch and validation, the app shall atomically replace the local inventory snapshot and stop checking for the remainder of that month.

The PWA shall include an initial inventory snapshot in its static application package so a first-time user can browse pins before the first eligible check. User observations remain local and are never part of the inventory replacement.

**Acceptance criteria**

- Before the 7th of a month, the browser makes no DSNY inventory update-check request and uses the bundled or locally cached snapshot.
- On each calendar day from the 7th through the end of the month, the first app open may make one metadata/version check if the current day has not already been checked.
- Multiple tabs, reloads, and app opens on the same calendar day do not create additional metadata checks.
- If the API version is unchanged, the app retains the current local inventory and does not download the full row set.
- If the API reports a newer version, the app downloads and validates the full inventory using the more-than-1,000-row strategy before replacing the local snapshot.
- A failed metadata check or full-data fetch leaves the prior local snapshot intact; a later eligible day may try again.
- After a successful inventory replacement, no further metadata checks or full-data fetches occur until the 7th of the next month.
- The refresh schedule applies to the DSNY inventory API only; on-demand NYC address search remains a separate user-initiated function.
- Refresh-cycle metadata, the locally applied source version, and check dates are stored locally and are not shown in the UI.

## 6. 311 integration requirements

### 311-001 — Official handoff

The app shall link to the official NYC 311 complaint submission form:

```text
https://portal.311.nyc.gov/servicerequest-create/What?caid=794e51a3-3f16-ec11-b6e5-0022481cc62d&kasid=10a2780b-6161-ef11-bfe2-7c1e5217eb2d
```

**Acceptance criteria**

- The link is configurable and opens the official page in a new tab or equivalent browser context.
- The UI identifies the destination as NYC 311 before the user leaves the app.
- The app does not use an undocumented form-submission mechanism.

### 311-002 — Generated complaint text

The generated draft shall be conservative and factual. Example template:

```text
On {observedDate}, I observed a missing public litter basket at the location
listed in the DSNY Litter Basket Inventory at {location}. Basket ID: {basketId}.
Please investigate the location and replace the basket. Thank you! :)
```

**Acceptance criteria**

- Missing optional fields are omitted or replaced with neutral wording, never invented.
- The template includes the user’s observation date and official location context.
- The report preview is editable or copyable before the user submits through 311.

## 7. Technical architecture

### 7.1 Recommended components

| Concern | Choice | Rationale |
|---|---|---|
| UI | React + TypeScript | Componentized map, detail, search, and observation flows |
| Build | Vite | Fast PWA development and static build output |
| Map | MapLibre GL JS with OpenFreeMap Bright style | Open vector map rendering with no client API key; provider remains replaceable |
| PWA | `vite-plugin-pwa` or equivalent Workbox integration | Manifest, service worker, cache strategies |
| Address search | NYC GeoSearch API adapter | NYC-focused autocomplete and forward search returning GeoJSON |
| Official inventory | NYC Open Data Socrata API, called from the browser | DSNY source of truth |
| User observations and added pins | IndexedDB, with a small localStorage fallback | Local persistence without accounts or remote storage |
| Spatial data | GeoJSON/source layers and numeric latitude/longitude in browser memory | Efficient map rendering and local filtering |
| Hosting | Static hosting such as Vercel, Cloudflare Pages, or GitHub Pages | Serve the PWA without an application backend |
| Testing | Vitest, React Testing Library, Playwright, axe checks | Unit, component, end-to-end, and accessibility coverage |
| Diagnostics | Local development diagnostics and release-time smoke checks | Identify failures without collecting or transmitting user data |

### 7.2 Application boundaries

- `map`: MapLibre initialization, style, controls, pin rendering, clustering if needed.
- `baskets`: normalized inventory client, cache, selectors, detail model.
- `observations`: official-basket status calculation, create local observations, user-added **📍** pin creation/reconfirmation/removal, and persistence.
- `search`: NYC GeoSearch adapter and debounce/race protection.
- `reporting`: 311 text template, clipboard, external-link behavior.
- `data-loader`: scheduled Socrata requests, pagination, normalization, local cache, and private refresh-cycle metadata.
- `local-store`: IndexedDB/localStorage adapter for inventory cache, official-basket observations, and user-added **📍** pins.
- `accessibility`: focus management, search-result alternative, and text status labels.

### 7.3 Status calculation contract

```ts
type ObservationStatus = "exists" | "missing";

type UserObservation = {
  status: ObservationStatus;
  observedAt: string;
};

function getPinGlyph(
  latest: UserObservation | undefined,
  now: Date,
): "🗑️" | "🚮" | "🚨" {
  if (!latest) return "🗑️";
  if (latest.status === "missing") return "🚨";
  const ageMs = now.getTime() - new Date(latest.observedAt).getTime();
  return ageMs <= 30 * 24 * 60 * 60 * 1000 ? "🚮" : "🗑️";
}
```

The production implementation must use calendar-day handling in the chosen timezone rather than relying only on elapsed milliseconds.

### 7.4 Caching strategy

- Cache the PWA shell with a cache-first strategy.
- Cache the bundled or latest successful normalized inventory in IndexedDB with a cache-first strategy.
- Cache search suggestions briefly and never persist unnecessary personal search history.
- Save observations immediately to IndexedDB; observations do not require a network request or synchronization queue.
- Save user-added **📍** pins immediately to IndexedDB; pin placement, reconfirmation, and removal do not require a network request or synchronization queue.
- Never cache a successful-looking response for a failed or partial inventory refresh.
- Do not display inventory refresh timestamps, source freshness values, or location-accuracy disclosures in the UI.
- Permit one daily inventory-version check beginning on the 7th of each month, with a local refresh-cycle lock; permit full row retrieval only after a newer version is confirmed.

## 8. Non-functional requirements

### NFR-001 — Performance

**Acceptance criteria**

- On a representative mobile device and normal broadband, the app shell becomes interactive within 3 seconds after the initial HTML is available.
- A cached inventory renders without waiting for a fresh network request.
- Pin rendering remains usable at NYC-wide extent; clustering or source-layer rendering is introduced if profiling shows unacceptable frame rate.
- Search requests are debounced and stale responses cannot overwrite newer results.

### NFR-002 — Availability and resilience

**Acceptance criteria**

- A temporary Socrata outage does not erase the last successful inventory.
- A browser storage error gives a retryable error and does not claim that an observation was saved.
- The app exposes a meaningful offline/degraded state.

### NFR-003 — Privacy

**Acceptance criteria**

- No continuous location history is stored.
- The app requests geolocation only for the current map interaction.
- Local observation records do not require name, email, phone number, or address-book access.
- The app does not transmit local observations, user-added pin coordinates, or precise user coordinates to an application-owned service.
- Privacy documentation explains that observations and user-added pins are retained only in the user’s browser storage until cleared, removed in the app, or removed by browser/site-data settings.

### NFR-004 — Client data safety

**Acceptance criteria**

- Observation actions validate basket IDs against the currently loaded or cached inventory before saving.
- The MVP has no private server-side credentials or application backend.
- External URLs are allowlisted; report text is escaped and treated as data.
- Product documentation makes clear that clearing browser/site data can remove observations and pins; no standalone local-data controls are displayed on the map page.

### NFR-005 — Accessibility

**Acceptance criteria**

- Primary flows meet WCAG 2.2 AA expectations for keyboard navigation, focus, labels, contrast, and status announcements.
- Emoji pins are paired with accessible text labels.
- The app supports reduced motion and does not require precise touch gestures for official-basket browsing or reporting flows.
- Local pin placement remains available through the long-press map flow; the separate “Add pin here” button is intentionally not part of this compact interface.

### NFR-006 — Browser support

**Acceptance criteria**

- The latest two major versions of Chrome, Edge, Firefox, and Safari are supported for core browsing.
- Unsupported browsers receive a readable fallback message and a link to the web version.
- Geolocation, Clipboard API, service worker, and IndexedDB fallbacks are tested independently.

### NFR-007 — Client diagnostics

**Acceptance criteria**

- Local refresh diagnostics include duration, status, source row count, valid row count, invalid row count, and duplicate count.
- Client errors exclude local observation contents and unnecessary precise location data.
- Development and release checks cover repeated refresh failures, zero-row responses, schema failures, and abnormal row-count changes.

## 9. Testing strategy

### TEST-001 — Unit tests

Cover coordinate validation, field normalization, 30-day boundary logic, status precedence, date/timezone handling, long-press gesture thresholds, local-pin persistence and date updates, report-template generation, query construction, and pagination termination.

**Acceptance criteria**

- Tests cover no observation, fresh exists, exactly 30 days, older exists, missing, and missing followed by exists.
- Tests cover optional and missing source fields.
- Tests cover long press success, movement/release cancellation, local-pin confirmation, reconfirmation, removal, reload persistence, and storage failure.
- Tests prove that a 1,237-row paginated result is not truncated or duplicated.

### TEST-002 — Integration tests

Cover the browser Socrata data loader, pagination, local-storage adapter, cache fallback, and NYC GeoSearch adapter with mocked external services.

**Acceptance criteria**

- An external API failure produces the specified recoverable UI state.
- A successful local observation updates the pin status and detail view.
- A confirmed long-press placement creates a **📍** local pin, and the local-pin dialog can reconfirm or remove it.
- Popup dialogs dismiss from an outside-overlay click without dismissing when the modal content itself is clicked.
- A page reload returns the locally saved observation for the same browser profile.

### TEST-003 — End-to-end tests

Use Playwright against a test environment to validate:

1. Open app and load pins.
2. Deny location and use address search.
3. Select a pin and inspect details.
4. Confirm exists and see 🚮.
5. Report missing, copy draft, and open 311 link.
6. Long-press the map, confirm a local **📍** pin, open it, reconfirm its date, and remove it.
7. Reload and retain the observation status and local pin.
8. Simulate offline mode and use cached inventory, local observations, and local pins.

**Acceptance criteria**

- Each flow passes on a mobile viewport and a desktop viewport.
- Popup blocking and clipboard denial are covered.
- Outside-overlay dismissal is covered for official-basket and local-pin dialogs, including the rule that active local saves are not interrupted.
- Long-press movement/release cancellation and the equivalent accessible add-pin action are covered.
- A test verifies that the official 311 page is opened only after the user reaches the report handoff step.

### TEST-004 — Data validation test

Run a repeatable ingestion test against a recorded fixture and, separately, a controlled live smoke test.

**Acceptance criteria**

- The fixture contains more than 1,000 rows and validates the high-limit and paginated code paths.
- The live smoke test verifies endpoint reachability, expected field names, nonzero valid coordinates, and plausible row count.
- Live smoke tests are read-only and do not create local user observations.
- Schedule tests verify one metadata check per eligible day beginning on the 7th, no checks before the 7th, no full row retrieval when the version is unchanged, and a full retrieval only after a newer version is confirmed.

## 10. Delivery plan

### Phase 0 — Technical spike

- Verify current Socrata endpoint version, response shape, field names, row count, and query behavior.
- Test `$limit=50000` and `$limit=1000` + `$offset` paging against a safe read-only query.
- Confirm NYC GeoSearch autocomplete/search behavior and map tile/style licensing.
- Produce or verify the bundled inventory snapshot and browser-local daily-check/source-version markers.

### Phase 1 — Map and search

- Implement PWA shell, map, source attribution, all-pins inventory load, current location, manual pan/zoom, and address search.
- Add loading, error, and offline-cache states without source-freshness or location-accuracy disclosures.

### Phase 2 — Basket details and observations

- Implement compact detail card, local observation persistence, official emoji pins, the long-press local **📍** pin flow, and 30-day rules.
- Test storage failure, browser reload, site-data clearing, and offline behavior before public testing.

### Phase 3 — 311 handoff and hardening

- Implement report preview, clipboard fallback, official 311 link, accessibility, and local/release diagnostics that exclude precise location history.
- Run fixture-based pagination tests and end-to-end mobile testing.

### Phase 4 — Post-MVP extensions

- Optional accounts and cross-device history.
- Community-wide status aggregation with confidence and recency.
- Photo evidence and moderation.
- Filters by basket type, borough, district, and status.
- Historical inventory comparison and changes over time.
- Neighborhood verification campaigns.

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Official inventory lags street conditions | Users may interpret an unconfirmed pin as a guarantee | Use the 🗑️ unconfirmed glyph, keep user observations distinct from official records, and avoid claiming DSNY confirmation |
| More than 1,000 rows are silently truncated | Map appears incomplete | Explicit high limit, deterministic fallback paging, row-count tests, and local refresh diagnostics |
| Emoji pins imply community consensus | User may overtrust one observation | MVP status is labeled as current-user observation; community aggregation is separate |
| User-added pins may be mistaken for official inventory | User may assume a **📍** pin is an official DSNY location | Keep added pins in a separate local layer, use the **📍** glyph, show the prior confirmation date, and explicitly label the dialog as a local user-seen pin |
| Public map provider has no SLA | Basemap availability or performance may vary | Keep the style URL behind replaceable configuration, preserve basket data locally, and retain required attribution |
| Socrata throttling or outage | Map may fail to load or delay a monthly update | Bundled/local snapshot, one daily metadata check from the 7th, and full retrieval only after a confirmed update |
| Geolocation denied | Nearby experience is less automatic | Manual locate, address search, and browsable NYC-wide map |
| 311 form changes | Handoff may become stale | Keep the link configurable and verify it during release checks |
| Local browser data is cleared | User loses observation history | Explain local-only storage, provide clear status wording, and avoid implying cross-device persistence |
| Large marker count harms mobile performance | Map becomes difficult to use | Use zoom-based marker sizing first; add clustering only when profiling demonstrates need |

## 12. Source references

- [DSNY Litter Basket Inventory API documentation](https://dev.socrata.com/foundry/data.cityofnewyork.us/8znf-7b2c)
- [DSNY Litter Basket Inventory dataset page](https://data.cityofnewyork.us/dataset/DSNY-Litter-Basket-Inventory/8znf-7b2c)
- [Socrata guidance: query more than 1,000 rows](https://support.socrata.com/hc/en-us/articles/202949268-How-to-query-more-than-1000-rows-of-a-dataset)
- [Socrata `LIMIT` documentation](https://dev.socrata.com/docs/queries/limit.html)
- [Socrata `OFFSET` documentation](https://dev.socrata.com/docs/queries/offset.html)
- [NYC GeoSearch API documentation](https://geosearch.planninglabs.nyc/docs/)
- [OpenFreeMap quick start guide](https://openfreemap.org/quick_start/)
- [OpenFreeMap public instance and attribution](https://openfreemap.org/)
- [NYC 311 complaint submission form](https://portal.311.nyc.gov/servicerequest-create/What?caid=794e51a3-3f16-ec11-b6e5-0022481cc62d&kasid=10a2780b-6161-ef11-bfe2-7c1e5217eb2d)

## 13. MVP definition of done

The MVP is complete when:

- A user can open the PWA and browse all valid official basket pins across NYC.
- A user can search an NYC address/place or use current location to navigate the map.
- A user can inspect official basket details without seeing the `basketid`, source freshness, or location-accuracy disclosure.
- A user can confirm a basket exists and see the pin become 🚮 for 30 days.
- A user can report a basket missing and see the pin become 🚨, with later confirmation correctly superseding it.
- Unconfirmed or stale locations use 🗑️ and remain distinguishable from reported-missing locations.
- A user can long-press anywhere on the map, confirm a locally stored “Saw Basket Here” pin rendered as **📍**, open it to see the prior confirmation date, reconfirm it, or remove it.
- The app generates a factual 311 draft, copies it or exposes it for manual copy, and links to official NYC 311 without claiming submission.
- Inventory ingestion proves it can retrieve more than 1,000 rows using the explicit-limit path and the offset-pagination fallback.
- Beginning on the 7th of each month, the app checks once daily for an updated dataset and replaces the local inventory only after confirming and successfully fetching the newer data.
- Core flows pass on mobile and desktop, including location denial, offline cache, clipboard failure, popup blocking, and API failure states.
- Accessibility, privacy, browser-local storage, client diagnostics, and monthly update-detection/refresh behavior are in place.
