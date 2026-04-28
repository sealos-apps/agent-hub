import type {
  AgentBlueprint,
  AgentHubRegion,
  AgentSettingField,
  AgentTemplateDefinition,
} from "../../../domains/agents/types";
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
  onChange: (field: keyof AgentBlueprint, value: string) => void;
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
  return (
    <Modal
      description={
        mode === "create"
          ? "确认模板和资源配置后，即可创建实例。"
          : `正在编辑 ${blueprint.aliasName || blueprint.appName} 的资源规格。`
      }
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            取消
          </Button>
          <Button disabled={submitting} onClick={onSubmit}>
            {submitting
              ? "部署中..."
              : mode === "create"
                ? "确认部署"
                : "保存配置"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={`配置 ${template?.name || "Agent"}`}
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
