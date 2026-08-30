import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

declare global {
  interface Window {
    __flowLensRevokedUrls: string[]
  }
}

const screenshotDir = resolve('artifacts/screenshots')
mkdirSync(screenshotDir, { recursive: true })

const runNames = ['基线 1', '基线 2', '基线 3', '改后 1', '改后 2', '改后 3'] as const

test.beforeEach(async ({ page }) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') externalRequests.push(request.url())
    }
  })
  await page.addInitScript(() => {
    window.addEventListener('beforeunload', () => undefined)
  })
  ;(page as typeof page & { __externalRequests?: string[] }).__externalRequests = externalRequests
})

test.afterEach(async ({ page }) => {
  const requests = (page as typeof page & { __externalRequests?: string[] }).__externalRequests ?? []
  expect(requests, 'The prototype must not make non-local requests').toEqual([])
})

async function startSynthetic(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '开始合成体验' }).click()
  await expect(page.getByRole('heading', { name: '先确认这是一段合成体验' })).toBeVisible()
}

async function acknowledgeScope(page: Page) {
  await page.getByRole('button', { name: '确认合成数据与结论边界' }).click()
  await expect(page.getByRole('heading', { name: '检查 基线 1' })).toBeVisible()
}

async function resolveLowConfidence(page: Page) {
  const metric = page.getByRole('region', { name: '可复现的描述性指标' })
  await expect(metric.getByText('5', { exact: true })).toBeVisible()
  await page.locator('.evidence-list button[data-observation-id="before-1:low-confidence"]').click()
  await expect(page.getByText('低置信候选', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: '确认并纳入指标' }).click()
  await expect(metric.getByText('6', { exact: true })).toBeVisible()
  await expect(page.locator('.evidence-list button[data-observation-id="before-1:low-confidence"]')).toBeFocused()
}

async function markCurrentRunReviewed(page: Page) {
  await page.getByRole('button', { name: '标记此记录已查看' }).click()
}

async function reviewAllRuns(page: Page) {
  for (let index = 0; index < runNames.length; index += 1) {
    const runName = runNames[index]!
    if (index > 0) {
      await page.getByRole('button', { name: `查看并复核 ${runName}` }).click()
      await expect(page.getByRole('heading', { name: runName, exact: true })).toBeVisible()
    }
    if (runName === '基线 1') await resolveLowConfidence(page)
    await markCurrentRunReviewed(page)
  }
  await expect(page.getByRole('heading', { name: '写下一项你能撤销的改动' })).toBeVisible()
  await expect(page.getByText('逐次检查 6 / 6')).toBeVisible()
}

async function openCompareFromGuide(page: Page) {
  await page.getByRole('button', { name: '写下并锁定一项可逆改动' }).click()
  await expect(page.getByRole('heading', { name: '先检查对比资格，再看描述性差值' })).toBeVisible()
  await expect(page.locator('#stage-content')).toBeFocused()
}

async function expectNoSeriousAxe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([])
}

test('first-run explains the synthetic task, local 1 + 1 limit and claim ceiling', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '用 6 次合成复盘，检验一项可逆改动' })).toBeVisible()
  await expect(page.getByText('全部数字都是合成示例')).toBeVisible()
  await expect(page.getByText('不能证明效率、原因、用户价值或真实视频能力。', { exact: false })).toBeVisible()
  await expect(page.getByText('本地视频每侧只能选 1 个', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: '你会完成 4 件事' })).toBeVisible()
  await expect(page.getByRole('button', { name: '开始合成体验' })).toBeVisible()
  await expectNoSeriousAxe(page)
  await page.screenshot({
    path: resolve(screenshotDir, testInfo.project.name === 'mobile-chromium' ? 'mobile-start-390.png' : 'desktop-start.png'),
    fullPage: true,
  })
})

test('desktop completes the evidence review, correction, 3 + 3, one-change and decision loop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop complete path has a dedicated mobile companion')
  await startSynthetic(page)
  await acknowledgeScope(page)

  await page.locator('.evidence-list button[data-observation-id="before-1:event-1"]').click()
  const eventOne = page.locator('.timeline-event[data-observation-id="before-1:event-1"]')
  const originalLabel = await eventOne.getAttribute('aria-label')
  const originalStart = originalLabel?.match(/(\d{2}:\d{2}\.\d{3})/)?.[1]
  const originalZone = (await page.locator('.zone-list button[aria-current="true"]').first().innerText()).split('\n')[0]!
  await page.getByRole('button', { name: '修订', exact: true }).click()
  await page.getByLabel('低层事件类型').click()
  await page.getByRole('option', { name: '重复访问' }).click()
  await page.getByRole('combobox', { name: '工位区域' }).click()
  await page.getByRole('option', { name: '纸箱' }).click()
  await page.getByLabel('开始秒数', { exact: true }).fill('1.50')
  await page.getByLabel('结束秒数', { exact: true }).fill('2.00')
  await page.getByRole('button', { name: '最终确认修订' }).click()
  await expect(eventOne).toHaveAttribute('aria-label', '重复访问，00:01.500 到 00:02.000')
  await expect(page.locator('.timecode-overlay')).toHaveText('00:01.500')
  await expect(page.locator('.zone-list button').filter({ hasText: '纸箱' }).first()).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.selected-evidence')).toContainText('00:01.500 - 00:02.000')
  await page.getByRole('button', { name: '撤销为新版本' }).click()
  await expect(eventOne).toHaveAttribute('aria-label', originalLabel!)
  await expect(page.locator('.timecode-overlay')).toHaveText(originalStart!)
  await expect(page.locator('.zone-list button[aria-current="true"]').first()).toContainText(originalZone)

  await reviewAllRuns(page)
  await page.locator('#stage-content').focus()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(screenshotDir, 'desktop-workbench.png'), fullPage: true })
  await openCompareFromGuide(page)
  await expect(page.getByText('6 / 6 条通过')).toBeVisible()
  await expect(page.getByRole('heading', { name: '合成差值，不是改善结论' })).toBeVisible()
  await expect(page.getByText('归因未建立。', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: '人工复核' })).toHaveCount(0)

  await page.getByRole('textbox', { name: '一项可逆改动' }).fill('把合成胶带区移近纸箱，并在下一轮保持其他条件不变。')
  await page.getByRole('button', { name: '锁定这项改动' }).click()
  await expect(page.getByText('已锁定当前版本')).toBeVisible()
  await page.getByRole('radio', { name: '保留改动' }).click()
  await expect(page.getByRole('radio', { name: '保留改动' })).toBeChecked()
  await expect(page.getByRole('heading', { name: '合成体验流程已完成' })).toBeVisible()

  await page.getByRole('button', { name: '复核证据' }).click()
  await page.locator('.evidence-list button[data-observation-id="after-3:event-1"]').click()
  await page.getByRole('button', { name: '修订', exact: true }).click()
  await page.getByLabel('结束秒数').fill('1.20')
  await page.getByRole('button', { name: '最终确认修订' }).click()
  await page.getByRole('button', { name: '查看对比' }).click()
  await expect(page.getByText('证据版本已变化。旧决定保留在历史中', { exact: false })).toBeVisible()
  await expect(page.getByRole('radio', { name: '保留改动' })).not.toBeChecked()
  await page.getByRole('radio', { name: '保留改动' }).click()
  await expect(page.getByRole('radio', { name: '保留改动' })).toBeChecked()
  await expect(page.getByRole('heading', { name: '合成体验流程已完成' })).toBeVisible()

  await page.locator('#stage-content').focus()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(screenshotDir, 'desktop-compare.png'), fullPage: true })
})

test('desktop stage navigation is mutually exclusive and restores focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop stage routing')
  await startSynthetic(page)
  await page.getByRole('button', { name: '查看对比' }).click()
  await expect(page.locator('#stage-content')).toBeFocused()
  await expect(page.getByRole('heading', { name: '先检查对比资格，再看描述性差值' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '人工复核' })).toHaveCount(0)
  await expect(page.locator('.comparison-measures')).toHaveCount(0)
  await page.getByRole('button', { name: '复核证据' }).click()
  await acknowledgeScope(page)
  await resolveLowConfidence(page)
  await markCurrentRunReviewed(page)
  for (const runName of runNames.slice(1, 5)) {
    await page.getByRole('button', { name: `查看并复核 ${runName}` }).click()
    await markCurrentRunReviewed(page)
  }
  await page.getByRole('button', { name: '查看对比' }).click()
  await expect(page.getByText('你已查看 5 / 6 个记录。', { exact: false })).toBeVisible()
  await expect(page.locator('.comparison-measures')).toHaveCount(0)
  await page.getByRole('button', { name: '证据来源' }).click()
  await expect(page.locator('#stage-content')).toBeFocused()
  await expect(page.getByRole('heading', { name: '来源、版本与不能得出的结论' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '先检查对比资格，再看描述性差值' })).toHaveCount(0)
  await page.screenshot({ path: resolve(screenshotDir, 'desktop-provenance.png'), fullPage: true })
})

test('coverage, comparability, observability, guardrail and source failures block every result surface', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop blocker matrix')
  const scenarios = [
    ['coverage-gap', '存在未知区间'],
    ['incomparable', '存在不可比记录'],
    ['observability-shift', '前后可见性发生变化'],
    ['guardrail-harm', '保护条件尚未确认'],
    ['source-mismatch', '独立原始来源与复核标签不一致'],
  ] as const
  for (const [scenario, expected] of scenarios) {
    await page.goto(`/?demo=1&scenario=${scenario}`)
    await expect(page.getByRole('heading', { name: '先确认这是一段合成体验' })).toBeVisible()
    await page.getByRole('button', { name: '查看对比' }).click()
    await expect(page.getByRole('heading', { name: '对比已阻断' })).toBeVisible()
    await expect(page.getByText(expected, { exact: false }).first()).toBeVisible()
    await expect(page.getByText('这不是负向结果，也不能补算为零。', { exact: false })).toBeVisible()
    await expect(page.locator('.comparison-measures')).toHaveCount(0)
    await expect(page.getByRole('radio', { name: '保留改动' })).toBeDisabled()
  }
  await page.screenshot({ path: resolve(screenshotDir, 'desktop-blocked.png'), fullPage: true })
})

test('zone geometry is versioned and blocks coverage until explicit re-review', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop zone-provenance path')
  await page.goto('/?demo=1')
  await expect(page.getByRole('heading', { name: '人工复核' })).toBeVisible()
  const metric = page.getByRole('region', { name: '可复现的描述性指标' })
  const originalTrace = await metric.locator('.metric-trace p').textContent()

  await page.locator('.zone-disclosure > summary').click()
  await page.locator('.zone-list').getByRole('button', { name: '编辑' }).first().click()
  await page.getByLabel('宽度').fill('25')
  await page.getByRole('button', { name: '保存区域' }).click()
  await expect(metric.getByRole('heading', { name: '证据不足，暂无指标' })).toBeVisible()
  await expect(metric).toContainText('区域几何已变化，需要重新确认复核覆盖范围')

  await page.getByRole('button', { name: '确认已检查完整原始来源' }).click()
  await expect(metric.getByText('5', { exact: true })).toBeVisible()
  const updatedTrace = await metric.locator('.metric-trace p').textContent()
  expect(updatedTrace).not.toBe(originalTrace)
})

test('loading, unsupported and local 1 + 1 states expose honest recovery', async ({ page }) => {
  await page.goto('/?state=loading')
  await expect(page.locator('main[aria-busy="true"]')).toBeVisible()
  await page.goto('/?state=error')
  await expect(page.getByRole('heading', { name: '无法打开这个素材' })).toBeVisible()
  await expect(page.getByRole('button', { name: '改用合成体验' })).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: '查看本地原始来源限制' }).click()
  await expect(page.getByText('每侧最多 1 个视频', { exact: false })).toBeVisible()
  await expect(page.getByText('不能形成有效 3+3 对比', { exact: false })).toBeVisible()
  await expect(page.getByText('没有自动视觉分析', { exact: false })).toBeVisible()
  await expectNoSeriousAxe(page)
})

test('local media decode failure revokes only the failed slot and preserves recovery', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop local-media lifecycle')
  await page.addInitScript(() => {
    window.__flowLensRevokedUrls = []
    const nativeRevoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (url: string) => {
      window.__flowLensRevokedUrls.push(url)
      nativeRevoke(url)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '查看本地原始来源限制' }).click()
  await page.getByRole('checkbox').check()
  await page.getByLabel('基线视频').setInputFiles('artifacts/fixtures/synthetic-local-valid.webm')
  await expect(page.getByRole('heading', { name: '人工复核' })).toBeVisible()
  await expect(page.getByText('当前是本地单次原始来源复核，不能完成 3+3')).toBeVisible()
  await expect(page.getByRole('heading', { name: '先确认本地来源与 1+1 限制' })).toBeVisible()
  await expect(page.getByText('理解本地范围')).toBeVisible()
  await expect(page.getByText('所有原始来源（source）、事件和差值都是程序化示例', { exact: false })).toHaveCount(0)
  await page.getByRole('button', { name: '查看对比' }).click()
  const localSourceCheck = page.locator('.eligibility-list li').filter({ hasText: '原始来源与复核标签一致' })
  await expect(localSourceCheck).toHaveClass(/is-blocked/)
  await expect(localSourceCheck).toContainText('本地来源未经验证')

  await page.locator('.session-tools > summary').click()
  await page.getByRole('button', { name: '本地原始来源' }).click()
  await page.getByRole('checkbox').check()
  await page.getByLabel('改后视频').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a decodable video') })
  await page.getByRole('button', { name: /本地改后/ }).click()
  await expect(page.getByRole('alert')).toContainText('失败的会话引用已撤销')
  await expect(page.getByRole('button', { name: '选择替代来源' })).toBeVisible()
  await expect(page.getByRole('button', { name: '改用合成体验' })).toBeVisible()
  await expect(page.getByRole('button', { name: /本地基线/ })).toBeVisible()
  expect(await page.evaluate(() => window.__flowLensRevokedUrls)).toHaveLength(1)

  await page.getByRole('button', { name: '证据来源' }).click()
  await expect(page.getByText('用户声明，未验证')).toBeVisible()
})

test('keyboard-only path preserves focus through scope, region, event, coverage and decision', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop keyboard path')
  await page.goto('/')
  const start = page.getByRole('button', { name: '开始合成体验' })
  await start.focus()
  await start.press('Enter')
  await expect(page.locator('#experience-guide-title')).toBeFocused()

  const acknowledge = page.getByRole('button', { name: '确认合成数据与结论边界' })
  await acknowledge.focus()
  await acknowledge.press('Enter')
  await expect(page.getByRole('heading', { name: '检查 基线 1' })).toBeVisible()

  const mapSettings = page.locator('.map-settings > summary')
  await mapSettings.focus()
  await mapSettings.press('Enter')
  const zoneButton = page.getByRole('button', { name: '数值圈定' })
  await zoneButton.focus()
  await zoneButton.press('Enter')
  const zoneName = page.getByLabel('区域名称')
  await zoneName.pressSequentially('辅助物料')
  await page.getByLabel('宽度').fill('0')
  const saveZone = page.getByRole('button', { name: '保存区域' })
  await saveZone.focus()
  await saveZone.press('Enter')
  await expect(page.getByRole('alert')).toBeFocused()
  await expectNoSeriousAxe(page)
  await page.getByLabel('宽度').fill('12')
  await saveZone.focus()
  await saveZone.press('Enter')
  await expect(zoneButton).toBeFocused()

  const create = page.getByRole('button', { name: '新建观察' })
  await create.focus()
  await create.press('Space')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.transport-primary')).toHaveAttribute('aria-label', '播放')
  await page.getByRole('button', { name: '取消' }).click()
  await create.focus()
  await create.press('Enter')
  await page.getByLabel('开始秒数').fill('0.70')
  await page.getByLabel('结束秒数').fill('0.60')
  const saveObservation = page.getByRole('button', { name: '保存为待复核' })
  await saveObservation.focus()
  await saveObservation.press('Enter')
  await expect(page.getByRole('alert')).toBeFocused()
  await expectNoSeriousAxe(page)
  await page.getByLabel('结束秒数').fill('0.74')
  await saveObservation.focus()
  await saveObservation.press('Enter')
  const selectedRow = page.locator('.evidence-list button[aria-current="true"]')
  await expect(selectedRow).toBeFocused()
  const uncertainNew = page.getByRole('button', { name: '标为不确定' })
  await uncertainNew.focus()
  await uncertainNew.press('Enter')
  await expect(selectedRow).toBeFocused()

  const lowConfidence = page.locator('.evidence-list button[data-observation-id="before-1:low-confidence"]')
  await lowConfidence.focus()
  await lowConfidence.press('Enter')
  const confirm = page.getByRole('button', { name: '确认并纳入指标' })
  await confirm.focus()
  await confirm.press('Enter')
  await expect(lowConfidence).toBeFocused()

  const eventOne = page.locator('.evidence-list button[data-observation-id="before-1:event-1"]')
  await eventOne.focus()
  await eventOne.press('Enter')
  const edit = page.getByRole('button', { name: '修订', exact: true })
  await edit.focus()
  await edit.press('Enter')
  await page.getByLabel('结束秒数').fill('1.16')
  const finalizeEdit = page.getByRole('button', { name: '最终确认修订' })
  await finalizeEdit.focus()
  await finalizeEdit.press('Enter')
  await expect(eventOne).toBeFocused()
  const undo = page.getByRole('button', { name: '撤销为新版本' })
  await undo.focus()
  await undo.press('Enter')
  await expect(eventOne).toBeFocused()

  for (const runName of runNames) {
    const run = page.getByRole('button', { name: new RegExp(`^${runName}`) })
    await run.focus()
    await run.press('Enter')
    const coverage = page.getByRole('button', { name: '确认已检查完整原始来源' })
    await coverage.focus()
    await coverage.press('Enter')
    await expect(run).toBeFocused()
    const reviewed = page.getByRole('button', { name: '标记此记录已查看' })
    await reviewed.focus()
    await reviewed.press('Enter')
  }

  const compare = page.getByRole('button', { name: '写下并锁定一项可逆改动' })
  await compare.focus()
  await compare.press('Enter')
  await expect(page.locator('#stage-content')).toBeFocused()
  const hypothesis = page.getByRole('textbox', { name: '一项可逆改动' })
  await hypothesis.focus()
  await hypothesis.pressSequentially('把辅助物料区移近纸箱，并继续复录。')
  const lock = page.getByRole('button', { name: '锁定这项改动' })
  await lock.focus()
  await lock.press('Enter')
  const uncertain = page.getByRole('radio', { name: '证据不足，继续复录' })
  await uncertain.focus()
  await uncertain.press('Space')
  await expect(uncertain).toBeChecked()

  await page.locator('.session-tools > summary').focus()
  await page.locator('.session-tools > summary').press('Enter')
  const reset = page.getByRole('button', { name: '重置会话' })
  await reset.focus()
  await reset.press('Enter')
  const clear = page.getByRole('button', { name: '清除会话' })
  await clear.focus()
  await clear.press('Enter')
  await expect(page.locator('#start-title')).toBeFocused()
})

test('desktop page has no serious accessibility violations, console errors or WebGL dependency', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop-specific audit')
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(message.text())
  })
  await page.goto('/?demo=1')
  await expect(page.getByRole('heading', { name: '人工复核' })).toBeVisible()
  await expectNoSeriousAxe(page)
  expect(await page.locator('canvas').count()).toBe(0)
  const dimensions = await page.evaluate(() => ({
    domNodes: document.querySelectorAll('*').length,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(dimensions.innerWidth).toBe(1440)
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth)
  expect(dimensions.domNodes).toBeLessThan(2_500)
  expect(consoleErrors).toEqual([])
})

test('mobile uses a real review stepper and completes the guided decision path', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-specific path')
  await startSynthetic(page)
  await acknowledgeScope(page)

  const surfaces = [
    ['来源', '基线 1'],
    ['时间轴', '事件与复核覆盖范围'],
    ['区域', '工位区域图'],
    ['观察', '人工复核'],
  ] as const
  for (const [tabName, headingName] of surfaces) {
    await page.getByRole('tab', { name: tabName }).click()
    await expect(page.getByRole('heading', { name: headingName, exact: true })).toBeVisible()
    await expect(page.locator(`#mobile-panel-${tabName === '来源' ? 'source' : tabName === '时间轴' ? 'timeline' : tabName === '区域' ? 'map' : 'evidence'}`)).toBeFocused()
  }
  await page.locator('.evidence-list button[data-observation-id="before-1:low-confidence"]').click()
  await page.getByRole('button', { name: '确认并纳入指标' }).click()
  await page.getByRole('tab', { name: '来源' }).click()
  await markCurrentRunReviewed(page)

  for (const runName of runNames.slice(1)) {
    await page.getByRole('button', { name: `查看并复核 ${runName}` }).click()
    await expect(page.getByRole('heading', { name: runName, exact: true })).toBeVisible()
    await markCurrentRunReviewed(page)
  }
  await page.locator('#stage-content').focus()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(screenshotDir, 'mobile-workbench.png'), fullPage: true })
  await openCompareFromGuide(page)
  await page.getByRole('textbox', { name: '一项可逆改动' }).fill('把合成胶带区移近纸箱，并保持其他条件不变。')
  await page.getByRole('button', { name: '锁定这项改动' }).click()
  await page.getByRole('radio', { name: '证据不足，继续复录' }).click()
  await expect(page.getByRole('heading', { name: '合成体验流程已完成' })).toBeVisible()
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth)
  await expectNoSeriousAxe(page)
  await page.locator('#stage-content').focus()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(screenshotDir, 'mobile-compare-390.png'), fullPage: true })
})

test('reduced motion removes nonessential animation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop reduced-motion audit')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?demo=1')
  await expect(page.getByRole('heading', { name: '人工复核' })).toBeVisible()
  const motion = await page.locator('.rt-Button').first().evaluate((element) => {
    const style = getComputedStyle(element)
    return { animationDuration: style.animationDuration, transitionDuration: style.transitionDuration }
  })
  expect(['0s', '0.001s', '0.01ms', '1e-05s']).toContain(motion.transitionDuration)
  expect(['0s', '0.001s', '0.01ms', '1e-05s']).toContain(motion.animationDuration)
})

test('320 CSS px and forced colors keep first-run and every review step usable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Single narrow/forced-colors audit')
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '用 6 次合成复盘，检验一项可逆改动' })).toBeVisible()
  await page.screenshot({ path: resolve(screenshotDir, 'mobile-start-320.png'), fullPage: true })
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '开始合成体验' }).click()
  await expect(page.getByRole('heading', { name: '先确认这是一段合成体验' })).toBeVisible()
  for (const [tabName, headingName] of [
    ['来源', '基线 1'],
    ['时间轴', '事件与复核覆盖范围'],
    ['区域', '工位区域图'],
    ['观察', '人工复核'],
  ] as const) {
    await page.getByRole('tab', { name: tabName }).click()
    await expect(page.getByRole('heading', { name: headingName, exact: true })).toBeVisible()
  }
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions).toEqual({ innerWidth: 320, scrollWidth: 320 })
  await expect(page.getByRole('group', { name: '移动端播放控制' })).toBeVisible()
  const targets = await page.locator('.mobile-surface-tabs > button, .mobile-transport > button').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }),
  )
  expect(targets.every((target) => target.height >= 44 && target.width >= 44)).toBe(true)
  await expectNoSeriousAxe(page)
  await page.screenshot({ path: resolve(screenshotDir, 'mobile-forced-colors-320.png'), fullPage: true })
})
