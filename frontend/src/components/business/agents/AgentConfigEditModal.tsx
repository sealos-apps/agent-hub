import type { ReactNode } from "react";
import {
  readBlueprintSettingValue,
} from "../../../domains/agents/blueprintFields";
import {
  filterModelOptionsForSlot,
  filterModelTypesForSlot,
  getTemplateLocalizedText,
  getTemplateModelSlots,
  hasTemplateModelSlots,
  RESOURCE_PRESETS,
} from "../../../domains/agents/templates";
import type {
  AgentBlueprint,
  AgentSettingField,
  AgentTemplateDefinition,
} from "../../../domains/agents/types";
import { formatModelOptionLabel } from "../../../domains/agents/modelCapabilities";
import { ModelCapabilitySelect } from "./ModelCapabilitySelect";
import { useI18n } from "../../../i18n";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { SelectMenu } from "../../ui/SelectMenu";

function parseStorageGi(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return 10;
  if (normalized.endsWith("gi")) {
    const numeric = Number(normalized.slice(0, -2));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 10;
  }
  if (normalized.endsWith("mi")) {
    const numeric = Number(normalized.slice(0, -2));
    return Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.round(numeric / 1024)) : 10;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 10;
}

function formatCpuLabel(value = "", unit = "核") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "--";
  if (normalized.endsWith("m")) {
    const numeric = Number(normalized.slice(0, -1));
    return Number.isFinite(numeric) ? `${numeric / 1000} ${unit}` : value;
  }
  return `${value} ${unit}`;
}

function formatMemoryLabel(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "--";
  if (normalized.endsWith("mi")) {
    const numeric = Number(normalized.slice(0, -2));
    return Number.isFinite(numeric) ? `${numeric / 1024} GiB` : value;
  }
  if (normalized.endsWith("gi")) {
    return `${normalized.slice(0, -2)} GiB`;
  }
  return value;
}

function ConfigField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-12 grid-cols-[108px_minmax(0,1fr)] items-center gap-4 border-b border-zinc-100 py-3 last:border-b-0">
      <div className="text-[13px]/5 text-zinc-500">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function AgentConfigEditModal({
  open,
  template,
  runtimeBlueprint,
  settingsBlueprint,
  submitting,
  onClose,
  onRuntimePreset,
  onRuntimeChange,
  onSettingsChange,
  onSettingsFieldChange,
  onSave,
}: {
  open: boolean;
  template: AgentTemplateDefinition | null;
  runtimeBlueprint: AgentBlueprint;
  settingsBlueprint: AgentBlueprint;
  submitting: boolean;
  onClose: () => void;
  onRuntimePreset: (presetId: AgentBlueprint["profile"]) => void;
  onRuntimeChange: <K extends keyof AgentBlueprint>(
    field: K,
    value: AgentBlueprint[K],
  ) => void;
  onSettingsChange: <K extends keyof AgentBlueprint>(
    field: K,
    value: AgentBlueprint[K],
  ) => void;
  onSettingsFieldChange: (field: AgentSettingField, value: string) => void;
  onSave: () => void;
}) {
  const { locale, t } = useI18n();
  if (!template) return null;

  const modelField =
    template.settings.agent.find((field) => field.binding.key === "model") ||
    null;
  const modelProviderField =
    template.settings.agent.find((field) => field.binding.key === "modelProvider") ||
    null;
  const modelAPIModeField =
    template.settings.agent.find((field) => field.binding.key === "modelAPIMode") ||
    null;
  const modelValue = modelField
    ? readBlueprintSettingValue(settingsBlueprint, modelField)
    : settingsBlueprint.model;
  const storageValue = parseStorageGi(runtimeBlueprint.storageLimit);
  const fixedPresets = RESOURCE_PRESETS.filter((preset) => preset.id !== "custom");
  const presetValue = fixedPresets.some((preset) => preset.id === runtimeBlueprint.profile)
    ? runtimeBlueprint.profile
    : "";
  const modelSlots = getTemplateModelSlots(template);
  const usesModelSlots = hasTemplateModelSlots(template);

  const handleModelChange = (value: string) => {
    const option = template.modelOptions.find((entry) => entry.value === value) || null;
    if (modelField) {
      onSettingsFieldChange(modelField, value);
    } else {
      onSettingsChange("model", value);
    }

    if (modelProviderField) {
      onSettingsFieldChange(modelProviderField, option?.provider || "");
    } else {
      onSettingsChange("modelProvider", option?.provider || "");
    }

    if (modelAPIModeField) {
      onSettingsFieldChange(modelAPIModeField, option?.apiMode || "");
    } else {
      onSettingsChange("modelAPIMode", option?.apiMode || "");
    }
  };
  const handleSlotModelChange = (slotKey: string, value: string) => {
    const option = template.modelOptions.find((entry) => entry.value === value) || null;
    onSettingsChange("modelSlots", {
      ...settingsBlueprint.modelSlots,
      [slotKey]: value,
    });

    if (slotKey !== "main") {
      return;
    }

    if (modelField) {
      onSettingsFieldChange(modelField, value);
    } else {
      onSettingsChange("model", value);
    }

    if (modelProviderField) {
      onSettingsFieldChange(modelProviderField, option?.provider || "");
    } else {
      onSettingsChange("modelProvider", option?.provider || "");
    }

    if (modelAPIModeField) {
      onSettingsFieldChange(modelAPIModeField, option?.apiMode || "");
    } else {
      onSettingsChange("modelAPIMode", option?.apiMode || "");
    }
  };

  return (
    <Modal
      description={t('agent.configModalDesc')}
      footer={
        <>
          <Button disabled={submitting} onClick={onClose} type="button" variant="secondary">
            {t('common.cancel')}
          </Button>
          <Button disabled={submitting} onClick={onSave} type="button">
            {submitting ? t('common.saving') : t('common.saveConfig')}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={t('agent.configModalTitle')}
      widthClassName="max-w-2xl"
    >
      <div className="rounded-[14px] border border-zinc-200 bg-white px-4">
        <ConfigField label={t('agent.presetConfig')}>
          <SelectMenu
            className="w-full"
            onChange={(value) => {
              if (!value) return;
              onRuntimePreset(value as AgentBlueprint["profile"]);
            }}
            options={[
              { label: t('agent.selectPreset'), value: "" },
              ...fixedPresets.map((preset) => ({
                label: t('agent.presetConfigOption', {
                  name: preset.id === "minimum"
                    ? t('agent.presetMinimum')
                    : preset.id === "recommended"
                      ? t('agent.presetRecommended')
                      : t('agent.presetLuxury'),
                  cpu: formatCpuLabel(preset.cpu, t('agent.unitCore')),
                  memory: formatMemoryLabel(preset.memory),
                }),
                value: preset.id,
              })),
            ]}
            portal
            showSelectedState={false}
            value={presetValue}
          />
        </ConfigField>

        <ConfigField label={t('agent.storageCapacity')}>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
              onClick={() => onRuntimeChange("storageLimit", `${Math.max(1, storageValue - 1)}Gi`)}
              type="button"
            >
              -
            </button>
            <input
              className="h-9 min-w-0 flex-1 rounded-[8px] border border-zinc-200 bg-white px-3 text-center text-[14px]/5 font-medium text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              min={1}
              onChange={(event) => {
                const numeric = Number(event.target.value);
                if (!Number.isFinite(numeric)) return;
                onRuntimeChange("storageLimit", `${Math.max(1, numeric)}Gi`);
              }}
              type="number"
              value={storageValue}
            />
            <span className="w-10 text-sm text-zinc-500">GiB</span>
            <button
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
              onClick={() => onRuntimeChange("storageLimit", `${storageValue + 1}Gi`)}
              type="button"
            >
              +
            </button>
          </div>
        </ConfigField>

        <ConfigField label={t('agent.alias')}>
          <input
            className="h-10 w-full rounded-[8px] border border-zinc-200 bg-white px-3 text-[14px]/5 font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            onChange={(event) => onSettingsChange("aliasName", event.target.value)}
            placeholder={t('agent.aliasPlaceholder')}
            value={settingsBlueprint.aliasName}
          />
        </ConfigField>

        {usesModelSlots ? (
          modelSlots.map((slot) => {
            const slotValue = settingsBlueprint.modelSlots[slot.key] || "";
            const slotOption = template.modelOptions.find((entry) => entry.value === slotValue);
            return (
              <ConfigField
                key={slot.key}
                label={getTemplateLocalizedText(slot.label, locale)}
              >
                {slot.mutable === false ? (
                  <div className="text-[14px]/5 font-medium text-zinc-900">
                    {formatModelOptionLabel(slotOption, t) || slotValue || t('summary.notSelected')}
                  </div>
                ) : (
                  <ModelCapabilitySelect
                    modelTypes={filterModelTypesForSlot(template.modelTypes, slot)}
                    fallbackLabel={slotValue || t('summary.notSelected')}
                    onChange={(value) => handleSlotModelChange(slot.key, value)}
                    options={filterModelOptionsForSlot(
                      template.modelOptions,
                      template.modelTypes,
                      slot,
                    )}
                    placeholder={t('agent.selectModel')}
                    portal
                    value={slotValue}
                  />
                )}
              </ConfigField>
            );
          })
        ) : (
          <ConfigField label={t('agent.model')}>
            <ModelCapabilitySelect
              modelTypes={template.modelTypes}
              fallbackLabel={modelValue || t('summary.notSelected')}
              onChange={handleModelChange}
              options={template.modelOptions}
              placeholder={t('agent.selectModel')}
              portal
              value={modelValue}
            />
          </ConfigField>
        )}
      </div>
    </Modal>
  );
}
