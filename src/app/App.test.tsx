import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from './App'

function renderApp() {
  return render(<Theme appearance="dark"><App /></Theme>)
}

afterEach(() => cleanup())

describe('Flow Lens vertical slice', () => {
  it('loads the deterministic fixture and keeps low-confidence evidence outside metrics until confirmation', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: '开始合成体验' }))
    const inspector = await screen.findByRole('heading', { name: '人工复核' }, { timeout: 2_000 })
    expect(inspector).toBeVisible()

    const metricRegion = screen.getByRole('region', { name: '可复现的描述性指标' })
    expect(within(metricRegion).getByText('5')).toBeVisible()

    await user.click(document.querySelector<HTMLButtonElement>('.evidence-list button[data-observation-id="before-1:low-confidence"]')!)
    await user.click(screen.getByRole('button', { name: '确认并纳入指标' }))

    expect(await within(metricRegion).findByText('6', {}, { timeout: 1_000 })).toBeVisible()
    expect(screen.getByText('已根据最终证据重新计算。')).toBeVisible()
  })

  it('shows a multi-run descriptive comparison and keeps attribution blocked', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '开始合成体验' }))
    await screen.findByRole('heading', { name: '人工复核' }, { timeout: 2_000 })

    await user.click(screen.getByRole('button', { name: '查看对比' }))
    expect(screen.getByRole('heading', { name: '先检查对比资格，再看描述性差值' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '人工复核' })).not.toBeInTheDocument()
    expect(screen.queryByText('归因未建立。', { exact: false })).not.toBeInTheDocument()
    expect(document.querySelector('.comparison-measures')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '证据不足，继续复录' })).toBeDisabled()
    expect(screen.getByText('你已查看 0 / 6 个记录。', { exact: false })).toBeVisible()
  })

  it('rejects an unsupported local file and offers the synthetic fallback', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderApp()
    await user.click(screen.getByRole('button', { name: '查看本地原始来源限制' }))
    await user.click(screen.getByRole('checkbox'))
    const fileInput = screen.getByLabelText('基线视频')
    await user.upload(fileInput, new File(['not video'], 'fixture.txt', { type: 'text/plain' }))
    expect(await screen.findByRole('heading', { name: '无法打开这个素材' })).toBeVisible()
    expect(screen.getByRole('button', { name: '改用合成体验' })).toBeVisible()
  })
})
