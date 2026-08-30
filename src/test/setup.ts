import '@testing-library/jest-dom/vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
})

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  writable: true,
  value: () => undefined,
})

Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
  writable: true,
  value: () => false,
})

Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
  writable: true,
  value: () => undefined,
})

Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
  writable: true,
  value: () => undefined,
})
