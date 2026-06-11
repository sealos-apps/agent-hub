import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { I18nProvider } from '../../../i18n'
import { AgentWebUIWorkspace } from './AgentWebUIWorkspace'

describe('AgentWebUIWorkspace', () => {
  it('sandboxes embedded agent web UI pages', () => {
    render(
      <I18nProvider>
        <AgentWebUIWorkspace url="https://agent.example.com/" />
      </I18nProvider>,
    )

    expect(screen.getByTitle('Agent Web UI')).toHaveAttribute(
      'sandbox',
      'allow-forms allow-popups allow-scripts',
    )
  })
})
