import type { TranslateFn } from '../../i18n'

export function translateAgentReason(reason: string, t: TranslateFn) {
  switch (String(reason || '').trim()) {
    case 'entry_unavailable':
      return t('agent.reasonEntryUnavailable')
    case 'api_url_unavailable':
      return t('agent.reasonApiUrlUnavailable')
    case 'ssh_domain_missing':
      return t('agent.reasonSshDomainMissing')
    case 'ssh_port_unavailable':
      return t('agent.reasonSshPortUnavailable')
    case 'web_ui_url_unavailable':
      return t('agent.reasonWebUIUnavailable')
    case 'unknown_entry_type':
      return t('agent.reasonUnknownEntryType')
    case 'not_startable':
      return t('agent.reasonNotStartable')
    case 'not_pausable':
      return t('agent.reasonNotPausable')
    case 'action_unimplemented':
      return t('agent.reasonActionUnimplemented')
    case 'workspace_unavailable':
      return t('agent.reasonWorkspaceUnavailable')
    case 'bootstrap_not_ready':
      return t('agent.reasonBootstrapNotReady')
    case 'agent_paused':
      return t('agent.reasonAgentPaused')
    case 'config_error':
      return t('agent.reasonConfigError')
    case 'waiting_for_bootstrap':
    case 'waiting_for_instance':
    case 'running_template_bootstrap':
    case 'waiting_for_health_check':
      return t('agent.preparingShort')
    case 'bootstrap_ready':
      return t('agent.ready')
    case 'instance_start_timeout':
      return t('agent.reasonInstanceStartTimeout')
    default:
      return reason
  }
}
