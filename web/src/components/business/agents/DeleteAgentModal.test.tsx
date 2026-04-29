import { fireEvent, render, screen } from '@testing-library/react'
import { createAgentItemFixture } from '../../../test/agentFixtures'
import { DeleteAgentModal } from './DeleteAgentModal'

describe('DeleteAgentModal', () => {
  it('requires typing the agent name before confirming deletion', () => {
    const onConfirm = vi.fn()
    const item = createAgentItemFixture({
      name: 'f95v42w6',
    })

    render(
      <DeleteAgentModal
        item={item}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        open
        submitting={false}
      />,
    )

    const confirmButton = screen.getByRole('button', { name: '确认删除' })
    expect(confirmButton).toBeDisabled()

    const nameInput = screen.getByPlaceholderText('f95v42w6')

    fireEvent.change(nameInput, {
      target: { value: 'felix助手' },
    })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(nameInput, {
      target: { value: 'f95v42w6' },
    })
    expect(confirmButton).toBeEnabled()

    fireEvent.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
