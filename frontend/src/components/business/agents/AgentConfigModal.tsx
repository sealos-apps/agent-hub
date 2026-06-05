import type {
  AgentBlueprint,
  AgentHubRegion,
  AgentSettingField,
  AgentTemplateDefinition,
} from "../../../domains/agents/types";
import { useI18n } from "../../../i18n";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { AgentConfigForm } from "./AgentConfigForm";

interface AgentConfigModalProps {
  open: boolean;
  mode: "create" | "edit";
  template: AgentTemplateDefinition | null;
  blueprint: AgentBlueprint;
  workspaceRegion: AgentHubRegion | string;
  workspaceModelBaseURL: string;
  workspaceModelKeyReady: boolean;
  submitting: boolean;
  onClose: () => void;
  onChange: <K extends keyof AgentBlueprint>(
    field: K,
    value: AgentBlueprint[K],
  ) => void;
  onChangeSettingField?: (field: AgentSettingField, value: string) => void;
  onSelectPreset: (presetId: AgentBlueprint["profile"]) => void;
  onSubmit: () => void;
}

export function AgentConfigModal({
  open,
  mode,
  template,
  blueprint,
  workspaceRegion,
  workspaceModelBaseURL,
  workspaceModelKeyReady,
  submitting,
  onClose,
  onChange,
  onChangeSettingField,
  onSelectPreset,
  onSubmit,
}: AgentConfigModalProps) {
  const { t } = useI18n();
  const displayName = blueprint.aliasName || blueprint.appName || template?.name || 'Agent';

  return (
    <Modal
      description={
        mode === "create"
          ? t('agent.configCreateDesc')
          : t('agent.configEditDesc', { name: displayName })
      }
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            {t('common.cancel')}
          </Button>
          <Button disabled={submitting} onClick={onSubmit}>
            {submitting
              ? t('common.deploying')
              : mode === "create"
                ? t('common.confirmDeploy')
                : t('common.saveConfig')}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={mode === "edit" ? t('agent.configModalTitle') : t('agent.configCreateTitle', { name: template?.name || 'Agent' })}
      widthClassName="max-w-4xl"
    >
      <AgentConfigForm
        blueprint={blueprint}
        mode={mode}
        onChange={onChange}
        onChangeSettingField={onChangeSettingField || (() => {})}
        onSelectPreset={onSelectPreset}
        template={template}
        workspaceRegion={workspaceRegion}
        workspaceModelBaseURL={workspaceModelBaseURL}
        workspaceModelKeyReady={workspaceModelKeyReady}
      />
    </Modal>
  );
}
