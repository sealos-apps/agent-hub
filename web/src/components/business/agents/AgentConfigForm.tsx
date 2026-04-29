import { HardDrive, Minus, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { readBlueprintSettingValue } from "../../../domains/agents/blueprintFields";
import { RESOURCE_PRESETS } from "../../../domains/agents/templates";
import {
  translateTemplateDescription,
  translateTemplateDocsLabel,
  useI18n,
} from "../../../i18n";
import { cn } from "../../../lib/format";
import type {
  AgentBlueprint,
  AgentHubRegion,
  AgentSettingField,
  AgentTemplateDefinition,
} from "../../../domains/agents/types";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Modal } from "../../ui/Modal";
import { SelectMenu } from "../../ui/SelectMenu";
import { Slider } from "../../ui/Slider";

interface AgentConfigFormProps {
  template: AgentTemplateDefinition | null;
  blueprint: AgentBlueprint;
  workspaceRegion: AgentHubRegion | string;
  mode?: "create" | "edit";
  workspaceModelBaseURL?: string;
  workspaceModelKeyReady?: boolean;
  onChangeTemplate?: () => void;
  onChange: (field: keyof AgentBlueprint, value: string) => void;
  onChangeSettingField: (field: AgentSettingField, value: string) => void;
  onSelectPreset: (presetId: AgentBlueprint["profile"]) => void;
}

function FormItem({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-sm font-medium text-zinc-900">{label}</div>
      {children}
      {hint ? (
        <div className="text-xs leading-5 text-zinc-500">{hint}</div>
      ) : null}
    </div>
  );
}

function SectionShell({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("workbench-card-strong flex flex-col p-6", className)}>
      <div>
        <div className="text-[1.02rem]/6 font-semibold tracking-[-0.02em] text-zinc-950">
          {title}
        </div>
        {description ? (
          <div className="mt-1 text-[13px]/6 text-zinc-500">{description}</div>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricDisplayField({
  label,
  value,
  suffix,
  hint,
  className,
}: {
  label: string;
  value: string;
  suffix: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-sm font-medium text-zinc-900">{label}</div>
      <div className="flex min-h-10 items-center gap-2 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3.5 text-sm text-zinc-900">
        <span className="font-medium">{value || "--"}</span>
        <span className="text-zinc-500">{suffix}</span>
      </div>
      {hint ? <div className="text-xs leading-5 text-zinc-500">{hint}</div> : null}
    </div>
  );
}

function NumberStepperField({
  label,
  value,
  suffix,
  hint,
  min = 1,
  max = 999,
  step = 1,
  onChange,
  className,
}: {
  label: string;
  value: number;
  suffix: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  const applyNextValue = (nextValue: number) => {
    const normalized = Math.min(max, Math.max(min, nextValue));
    onChange(normalized);
  };

  return (
    <FormItem className={className} hint={hint} label={label}>
      <div className="flex min-h-10 items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <button
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          onClick={() => applyNextValue(value - step)}
          type="button"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-center text-sm font-medium text-zinc-900 outline-none placeholder:text-zinc-400 focus:outline-none focus:ring-0"
          min={min}
          max={max}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            if (!Number.isFinite(nextValue)) {
              return;
            }
            applyNextValue(nextValue);
          }}
          step={step}
          type="number"
          value={value}
        />
        <span className="shrink-0 text-sm font-medium text-zinc-500">
          {suffix}
        </span>
        <button
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          onClick={() => applyNextValue(value + step)}
          type="button"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </FormItem>
  );
}

const CPU_OPTIONS = [1, 2, 4, 8, 16];
const MEMORY_OPTIONS = [2, 4, 8, 16, 32];

function resolveNearestStep(value: number, options: number[]) {
  if (!options.length) return 0;
  if (!Number.isFinite(value)) return options[0];

  return options.reduce((closest, option) => {
    const currentDistance = Math.abs(option - value);
    const closestDistance = Math.abs(closest - value);
    return currentDistance < closestDistance ? option : closest;
  }, options[0]);
}

export function AgentConfigForm({
  template,
  blueprint,
  workspaceRegion,
  onChangeTemplate,
  onChange,
  onChangeSettingField,
  onSelectPreset,
}: AgentConfigFormProps) {
  const { t } = useI18n();
  const [customResourceModalOpen, setCustomResourceModalOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(() => ({
    cpu: CPU_OPTIONS[1],
    memory: MEMORY_OPTIONS[1],
  }));

  if (!template) {
    return null;
  }

  const formWidthClassName = "w-full";
  const modelPresetHint = !template.modelOptions.length
    ? t('agent.modelPresetEmpty')
    : String(workspaceRegion || "").trim().toLowerCase() === "cn"
      ? t('agent.modelPresetCn')
      : t('agent.modelPresetUs');
  const controlClassName =
    "h-10 rounded-[10px] border-zinc-200 bg-white text-[14px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
  const compactInputClassName = `${controlClassName} w-full`;
  const getPresetLabel = (presetId: string) => {
    if (presetId === "minimum") return t('agent.presetMinimum');
    if (presetId === "recommended") return t('agent.presetRecommended');
    if (presetId === "luxury") return t('agent.presetLuxury');
    if (presetId === "custom") return t('agent.presetCustom');
    return presetId;
  };
  const getPresetDescription = (presetId: string) => {
    if (presetId === "minimum") return t('agent.presetMinimumDesc');
    if (presetId === "recommended") return t('agent.presetRecommendedDesc');
    if (presetId === "luxury") return t('agent.presetLuxuryDesc');
    if (presetId === "custom") return t('agent.presetCustomDesc');
    return "";
  };
  const getFieldLabel = (field: AgentSettingField) => {
    const bindingKey = String(field.binding?.key || "").trim();
    if (bindingKey === "model") return t('agent.model');
    if (bindingKey === "modelProvider") return t('agent.modelProvider');
    if (bindingKey === "modelBaseURL") return "Base URL";
    if (bindingKey === "keySource") return t('agent.keySource');
    return field.label;
  };

  const cpuDisplayValue = (() => {
    const normalized = String(blueprint.cpu || "").trim();
    if (!normalized) return "";
    if (normalized.toLowerCase().endsWith("m")) {
      const numeric = Number(normalized.slice(0, -1));
      return Number.isFinite(numeric) ? String(numeric / 1000) : normalized;
    }
    return normalized;
  })();
  const cpuSliderValue = resolveNearestStep(Number(cpuDisplayValue), CPU_OPTIONS);

  const memoryDisplayValue = (() => {
    const normalized = String(blueprint.memory || "").trim();
    if (!normalized) return "";
    const lower = normalized.toLowerCase();
    if (lower.endsWith("mi")) {
      const numeric = Number(normalized.slice(0, -2));
      return Number.isFinite(numeric) ? String(numeric / 1024) : normalized;
    }
    if (lower.endsWith("gi")) {
      return normalized.slice(0, -2);
    }
    return normalized;
  })();
  const memorySliderValue = resolveNearestStep(
    Number(memoryDisplayValue),
    MEMORY_OPTIONS,
  );

  const storageDisplayValue = (() => {
    const normalized = String(blueprint.storageLimit || "").trim();
    if (!normalized) return "";
    const lower = normalized.toLowerCase();
    if (lower.endsWith("gi")) {
      return normalized.slice(0, -2);
    }
    if (lower.endsWith("mi")) {
      const numeric = Number(normalized.slice(0, -2));
      return Number.isFinite(numeric) ? String(numeric / 1024) : normalized;
    }
    return normalized;
  })();
  const storageStepValue = (() => {
    const numeric = Number(storageDisplayValue);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 10;
  })();

  const openCustomResourceModal = () => {
    setCustomDraft({
      cpu: cpuSliderValue,
      memory: memorySliderValue,
    });
    setCustomResourceModalOpen(true);
  };

  const applyCustomResourceDraft = () => {
    onSelectPreset("custom");
    onChange("cpu", `${customDraft.cpu * 1000}m`);
    onChange("memory", `${Math.round(customDraft.memory * 1024)}Mi`);
    setCustomResourceModalOpen(false);
  };

  const handleModelChange = (value: string) => {
    const option =
      template.modelOptions.find((item) => item.value === value) || null;
    const modelField = template.settings.agent.find(
      (item) => item.binding.key === "model",
    );
    const providerField = template.settings.agent.find(
      (item) => item.binding.key === "modelProvider",
    );

    if (modelField) {
      onChangeSettingField(modelField, value);
    } else {
      onChange("model", value);
    }

    if (providerField) {
      onChangeSettingField(providerField, option?.provider || "");
    } else {
      onChange("modelProvider", option?.provider || "");
    }
  };

  const modelField = template.settings.agent.find(
    (field) => String(field.binding?.key || "").trim() === "model",
  );

  const isDisplayOnlyField = (field: AgentSettingField) => {
    const bindingKey = String(field.binding?.key || "").trim();
    return (
      field.readOnly ||
      bindingKey === "modelProvider" ||
      bindingKey === "modelBaseURL" ||
      bindingKey === "keySource"
    );
  };
  const editableFields = template.settings.agent.filter((field) => {
    const bindingKey = String(field.binding?.key || "").trim();
    return !isDisplayOnlyField(field) && bindingKey !== "model";
  });

  const renderRuntimeItem = () => (
    <SectionShell
      className={formWidthClassName}
      description={t('agent.runtimeSectionDesc')}
      title={t('agent.runtimeSection')}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border-[0.5px] border-zinc-200 bg-zinc-50">
            <img
              alt={`${template.name} logo`}
              className="h-7 w-7 object-cover"
              src={template.logo}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-zinc-950">
                {template.name}
              </span>
              <span className="shrink-0 rounded-full border-[0.5px] border-zinc-200 bg-white px-2 py-0.5 text-xs/4 font-medium text-zinc-600">
                {translateTemplateDocsLabel(template.id, template.docsLabel, t)}
              </span>
            </div>
            <div className="mt-0.5 text-sm/5 text-zinc-500">
              {translateTemplateDescription(template.id, template.description, t) || t('common.none')}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex max-w-[170px] items-center gap-1.5 text-xs text-zinc-500">
            <HardDrive size={14} className="text-zinc-400" />
            <span className="truncate font-mono" title={template.workingDir}>
              {template.workingDir}
            </span>
          </div>
          {onChangeTemplate ? (
            <Button
              onClick={onChangeTemplate}
              size="md"
              type="button"
              variant="secondary"
            >
              {t('agent.changeTemplate')}
            </Button>
          ) : null}
        </div>
      </div>
    </SectionShell>
  );

  const renderAgentSettingsCard = () => (
    <SectionShell
      className={formWidthClassName}
      description={t('agent.settingsSectionDesc')}
      title={t('agent.settingsSection')}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FormItem className="w-full" label={t('agent.alias')}>
          <Input
            className={`w-full ${controlClassName}`}
            onChange={(event) => onChange("aliasName", event.target.value)}
            placeholder={t('agent.aliasPlaceholder')}
            size="md"
            value={blueprint.aliasName}
          />
        </FormItem>
        {modelField ? <div>{renderEditableAgentField(modelField)}</div> : null}
      </div>

      {editableFields.length > 0 ? (
        <div className="mt-5">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t('agent.moreSettings')}
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {editableFields.map((field) => (
              <div key={field.key}>{renderEditableAgentField(field)}</div>
            ))}
          </div>
        </div>
      ) : null}
    </SectionShell>
  );

  const renderResourceCard = () => (
    <SectionShell
      className={formWidthClassName}
      description={t('agent.resourceSectionDesc')}
      title={t('agent.resourceSpec')}
    >
      <div className="grid grid-cols-2 gap-2.5">
        {RESOURCE_PRESETS.map((preset) => {
          const active = blueprint.profile === preset.id;
          const showCustomEdit = active && preset.id === "custom";
          return (
            <button
              className={`flex min-h-[84px] flex-col rounded-xl border px-3.5 py-3.5 text-left transition ${
                active
                  ? "border-zinc-900 bg-zinc-50 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
              }`}
              key={preset.id}
              onClick={() => {
                if (preset.id === "custom") {
                  openCustomResourceModal();
                  return;
                }
                onSelectPreset(preset.id);
              }}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-zinc-950">
                  {getPresetLabel(preset.id)}
                </span>
                <span
                  className={cn(
                    "inline-flex h-7 min-w-[72px] shrink-0 items-center justify-center rounded-full px-3",
                    showCustomEdit
                      ? "border border-zinc-200 bg-white text-[11px] font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                      : active
                        ? "bg-zinc-900 text-[10px] font-medium text-white"
                        : "invisible",
                  )}
                >
                  {showCustomEdit ? t('agent.clickEdit') : t('agent.current')}
                </span>
              </div>
              <div className="mt-2 text-xs leading-5 text-zinc-500">
                {getPresetDescription(preset.id)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricDisplayField
            className="w-full"
            label="CPU"
            suffix={t('agent.unitCore')}
            value={cpuDisplayValue}
          />
          <MetricDisplayField
            className="w-full"
            label={t('agent.memory')}
            suffix="GiB"
            value={memoryDisplayValue}
          />
          <NumberStepperField
            className="w-full"
            label={t('agent.storage')}
            onChange={(nextValue) => onChange("storageLimit", `${nextValue}Gi`)}
            step={1}
            suffix="GiB"
            value={storageStepValue}
          />
        </div>
      </div>
    </SectionShell>
  );

  const renderEditableAgentField = (field: AgentSettingField) => {
    const fieldValue = readBlueprintSettingValue(blueprint, field);
    const bindingKey = String(field.binding?.key || "").trim();

    if (bindingKey === "model") {
      const options = [
        { label: t('agent.selectModel'), value: "" },
        ...template.modelOptions.map((option) => ({
          label: option.helper
            ? `${option.label} · ${option.helper}`
            : option.label,
          value: option.value,
        })),
      ];

      return (
        <FormItem className="w-full" hint={modelPresetHint} label={getFieldLabel(field)}>
          <SelectMenu
            className="w-full"
            onChange={handleModelChange}
            options={options}
            value={fieldValue}
          />
        </FormItem>
      );
    }

    if (field.type === "select") {
      const options = [
        { label: t('common.select'), value: "" },
        ...(field.options || []).map((option) => ({
          label: option.label,
          value: option.value,
        })),
      ];

      return (
        <FormItem className="w-full" hint={field.description} label={getFieldLabel(field)}>
          <SelectMenu
            className="w-full"
            onChange={(value) => onChangeSettingField(field, value)}
            options={options}
            value={fieldValue}
          />
        </FormItem>
      );
    }

    return (
      <Input
        className={compactInputClassName}
        hint={field.description}
        label={getFieldLabel(field)}
        readOnly={field.readOnly}
        onChange={(event) => onChangeSettingField(field, event.target.value)}
        size="md"
        value={fieldValue}
      />
    );
  };

  return (
    <>
      <div
        className={`relative flex ${formWidthClassName} flex-col gap-4 pb-10 sm:pb-12 xl:h-full xl:pb-10`}
      >
        {renderRuntimeItem()}
        <div className="xl:flex-1">{renderAgentSettingsCard()}</div>
        {renderResourceCard()}
      </div>

      <Modal
        description={t('agent.customResourceDesc')}
        footer={
          <>
            <Button
              onClick={() => setCustomResourceModalOpen(false)}
              type="button"
              variant="secondary"
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={applyCustomResourceDraft} type="button">
              {t('common.applySettings')}
            </Button>
          </>
        }
        onClose={() => setCustomResourceModalOpen(false)}
        open={customResourceModalOpen}
        title={t('agent.customResourceTitle')}
        widthClassName="max-w-2xl"
      >
        <div className="space-y-8">
          <Slider
            label="CPU"
            onChange={(nextValue) =>
              setCustomDraft((current) => ({ ...current, cpu: nextValue }))
            }
            options={CPU_OPTIONS.map((value) => ({
              label: String(value),
              value,
            }))}
            unit={t('agent.unitCore')}
            value={customDraft.cpu}
          />
          <Slider
            label={t('agent.memory')}
            onChange={(nextValue) =>
              setCustomDraft((current) => ({ ...current, memory: nextValue }))
            }
            options={MEMORY_OPTIONS.map((value) => ({
              label: String(value),
              value,
            }))}
            unit="GiB"
            value={customDraft.memory}
          />
        </div>
      </Modal>
    </>
  );
}
