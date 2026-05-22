import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AgentNameCell } from './AgentNameCell'
import { createAgentItemFixture } from '../../../../test/agentFixtures'

describe('AgentNameCell', () => {
  it('edits the alias inline from the pencil button', async () => {
    const item = createAgentItemFixture({ name: 'go6becn4' })
    item.aliasName = 'test-1'
    item.contract.core.aliasName = 'test-1'
    const onRenameAlias = vi.fn().mockResolvedValue(undefined)

    render(
      <AgentNameCell
        item={item}
        onOpenDetail={vi.fn()}
        onRenameAlias={onRenameAlias}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '修改 test-1 的别名' }))
    const input = screen.getByRole('textbox', { name: '修改 Agent 别名' })

    fireEvent.change(input, { target: { value: '新的别名' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(onRenameAlias).toHaveBeenCalledWith(item, '新的别名')
    })
  })
})
