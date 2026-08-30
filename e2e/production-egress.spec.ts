import { expect, test } from '@playwright/test'

interface ConnectionAttempt {
  readonly kind: string
  readonly target: string
}

test('production CSP and runtime harness deny every connection API', async ({ page }) => {
  const nonStaticRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    const staticPath = url.hostname === '127.0.0.1' && (
      url.pathname === '/' ||
      url.pathname === '/index.html' ||
      url.pathname.startsWith('/assets/')
    )
    if (!staticPath || ['fetch', 'xhr', 'websocket', 'eventsource'].includes(request.resourceType())) {
      nonStaticRequests.push(`${request.resourceType()}:${request.url()}`)
    }
  })

  await page.addInitScript({
    content: `
      window.__flowLensConnectionAttempts = [];
      const record = (kind, target) => {
        window.__flowLensConnectionAttempts.push({ kind, target: String(target) });
        throw new Error('FLOW_LENS_CONNECTION_BLOCKED:' + kind);
      };
      window.fetch = (...args) => Promise.reject(record('fetch', args[0]));
      const NativeXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = class extends NativeXHR {
        open(method, url) { record('xhr', url); }
      };
      window.WebSocket = class { constructor(url) { record('websocket', url); } };
      window.EventSource = class { constructor(url) { record('eventsource', url); } };
      navigator.sendBeacon = (url) => { window.__flowLensConnectionAttempts.push({ kind: 'beacon', target: String(url) }); return false; };
    `,
  })

  await page.goto('/?demo=1', { waitUntil: 'load' })
  await expect(page.getByRole('heading', { name: '人工复核' })).toBeVisible()
  expect(nonStaticRequests).toEqual([])

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toContain("connect-src 'none'")
  expect(csp).not.toMatch(/connect-src[^;]*(localhost|127\.0\.0\.1|wss?:)/)

  const before = await page.evaluate(() => (window as unknown as { __flowLensConnectionAttempts: ConnectionAttempt[] }).__flowLensConnectionAttempts)
  expect(before).toEqual([])

  const attempts = await page.evaluate(async () => {
    try { await fetch('/runtime-fetch') } catch { /* expected harness block */ }
    try { const xhr = new XMLHttpRequest(); xhr.open('GET', '/runtime-xhr') } catch { /* expected harness block */ }
    try { new WebSocket('ws://127.0.0.1:4175/runtime-websocket') } catch { /* expected harness block */ }
    try { new EventSource('/runtime-eventsource') } catch { /* expected harness block */ }
    navigator.sendBeacon('/runtime-beacon', 'probe')
    return (window as unknown as { __flowLensConnectionAttempts: ConnectionAttempt[] }).__flowLensConnectionAttempts
  })
  expect(attempts.map((attempt) => attempt.kind).sort()).toEqual(['beacon', 'eventsource', 'fetch', 'websocket', 'xhr'])
  expect(nonStaticRequests).toEqual([])
})
