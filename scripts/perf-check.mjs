import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const target = process.env.FLOW_LENS_URL ?? 'http://127.0.0.1:4175/?demo=1'
const repeatCount = Number(process.env.FLOW_LENS_PERF_RUNS ?? 3)
const browser = await chromium.launch({ headless: true })

async function measureRun(index) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const externalRequests = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      externalRequests.push(request.url())
    }
  })
  await page.addInitScript(() => {
    window.__flowLensCls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__flowLensCls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })

  await page.goto(target, { waitUntil: 'load' })
  await page.getByRole('heading', { name: '人工复核' }).waitFor({ state: 'visible' })
  const readyMs = await page.evaluate(() => performance.now())
  const beforeInteraction = await page.evaluate(() => performance.now())
  await page.locator('.evidence-list button[data-observation-id="before-1:low-confidence"]').click()
  await page.getByRole('button', { name: '确认并纳入指标', exact: true }).click()
  await page.getByText('已根据最终证据重新计算。').waitFor({ state: 'visible' })
  const afterInteraction = await page.evaluate(() => performance.now())
  const browserMetrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0]
    const resources = performance.getEntriesByType('resource')
    return {
      domNodes: document.querySelectorAll('*').length,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      loadEventMs: navigation ? navigation.loadEventEnd : null,
      domContentLoadedMs: navigation ? navigation.domContentLoadedEventEnd : null,
      resourceCount: resources.length,
      transferBytes: resources.reduce((total, entry) => total + (entry.transferSize ?? 0), 0),
      cls: window.__flowLensCls ?? null,
    }
  })
  await context.close()
  return {
    index,
    readyMs,
    interactionMs: afterInteraction - beforeInteraction,
    externalRequests,
    ...browserMetrics,
  }
}

const samples = []
for (let index = 1; index <= repeatCount; index += 1) samples.push(await measureRun(index))
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const report = {
  target,
  command: 'npm run build && npm run preview; npm run perf',
  buildMode: 'Vite production preview',
  browser: `Chromium ${browser.version()}`,
  cacheMode: 'fresh browser context per sample',
  repeatCount,
  measuredAt: new Date().toISOString(),
  samples,
  summary: {
    medianReadyMs: median(samples.map((sample) => sample.readyMs)),
    medianInteractionMs: median(samples.map((sample) => sample.interactionMs)),
    maxCls: Math.max(...samples.map((sample) => sample.cls ?? 1)),
    maxDomNodes: Math.max(...samples.map((sample) => sample.domNodes)),
    maxTransferBytes: Math.max(...samples.map((sample) => sample.transferBytes)),
  },
  budgets: {
    readyMs: 1500,
    interactionMs: 500,
    cls: 0.1,
    domNodes: 2500,
  },
  evidenceCeiling: 'Local Chromium and synthetic fixture only. Not production or real-workflow performance evidence.',
}

const output = join(process.cwd(), 'artifacts/performance.json')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
await browser.close()

const passed = samples.every((sample) =>
  sample.externalRequests.length === 0 &&
  sample.readyMs < report.budgets.readyMs &&
  sample.interactionMs < report.budgets.interactionMs &&
  (sample.cls ?? 1) < report.budgets.cls &&
  sample.domNodes < report.budgets.domNodes &&
  sample.scrollWidth <= sample.innerWidth,
)

if (!passed) {
  console.error('PERFORMANCE_CHECK_FAILED')
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
}
console.log('PERFORMANCE_CHECK_PASS')
console.log(JSON.stringify(report, null, 2))
