import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = () => 'blob:vitest-maplibre-worker'
}

if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = () => undefined
}
