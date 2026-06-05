import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  FileText,
  HardDrive,
  Info,
  Link2,
  Minus,
  PauseCircle,
  Plus,
  Clock3,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { readBlueprintSettingValue } from "../../../../domains/agents/blueprintFields";
import { formatModelProviderLabel } from "../../../../domains/agents/aiproxy";
import {
  filterModelOptionsForSlot,
  filterModelTypesForSlot,
  getTemplateLocalizedText,
  getTemplateModelSlots,
  hasTemplateModelSlots,
  RESOURCE_PRESETS,
} from "../../../../domains/agents/templates";
import { translateAgentReason } from '../../../../domains/agents/reasons';
import type {
  AgentBlueprint,
  AgentHubRegion,
  AgentListItem,
  AgentSettingField,
  AgentTemplateDefinition,
} from "../../../../domains/agents/types";
import { useI18n } from "../../../../i18n";
import { cn, formatTime } from "../../../../lib/format";
import { Button } from "../../../../components/ui/Button";
import { Modal } from "../../../../components/ui/Modal";
import { SelectMenu } from "../../../../components/ui/SelectMenu";
import { Slider } from "../../../../components/ui/Slider";
import { ModelCapabilitySelect } from "../../../../components/business/agents/ModelCapabilitySelect";
import { formatModelOptionLabel } from "../../../../domains/agents/modelCapabilities";
import { StatusBadge } from "../../../../components/ui/StatusBadge";

interface AgentSettingsWorkspaceProps {
  editing: boolean;
  item: AgentListItem;
  template: AgentTemplateDefinition | null;
  runtimeBlueprint: AgentBlueprint;
  settingsBlueprint: AgentBlueprint;
  workspaceRegion: AgentHubRegion | string;
  workspaceModelBaseURL: string;
  workspaceModelKeyReady: boolean;
  onRuntimeChange: (field: keyof AgentBlueprint, value: string) => void;
  onRuntimePreset: (presetId: AgentBlueprint["profile"]) => void;
  onSettingsChange: <K extends keyof AgentBlueprint>(
    field: K,
    value: AgentBlueprint[K],
  ) => void;
  onSettingsFieldChange: (field: AgentSettingField, value: string) => void;
}

function formatKeySourceLabel(value = "", ready = false, t: ReturnType<typeof useI18n>["t"]) {
  if (!ready) return t('agent.keyNotReady');
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "unset") return t('agent.keyNotReady');
  if (normalized === "workspace-aiproxy") return t('agent.keyFromWorkspace');
  return value;
}

function copyText(value: string) {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}

function formatDurationSince(value = "", t: ReturnType<typeof useI18n>["t"]) {
  const startedAt = new Date(value).getTime();
  if (!Number.isFinite(startedAt)) return "--";
  const totalMinutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} ${t('agent.day')} ${hours} ${t('agent.hour')} ${minutes} ${t('agent.minute')}`;
  if (hours > 0) return `${hours} ${t('agent.hour')} ${minutes} ${t('agent.minute')}`;
  return `${minutes} ${t('agent.minute')}`;
}

function resolveHealthDisplay(item: AgentListItem, t: ReturnType<typeof useI18n>["t"]) {
  if (item.status === "running" && item.ready) {
    return {
      label: t("agent.normal"),
      icon: CheckCircle2,
      iconClassName: "bg-emerald-50 text-emerald-600",
      badgeClassName: "bg-emerald-50 text-emerald-700",
    };
  }

  if (item.status === "error") {
    return {
      label: item.bootstrapMessage ? translateAgentReason(item.bootstrapMessage, t) : t("agent.error"),
      icon: AlertCircle,
      iconClassName: "bg-rose-50 text-rose-600",
      badgeClassName: "bg-rose-50 text-rose-700",
    };
  }

  if (item.status === "stopped") {
    return {
      label: t("agent.statusStopped"),
      icon: PauseCircle,
      iconClassName: "bg-slate-50 text-slate-600",
      badgeClassName: "bg-slate-50 text-slate-700",
    };
  }

  return {
    label: item.bootstrapMessage ? translateAgentReason(item.bootstrapMessage, t) : t("agent.statusCreating"),
    icon: Clock3,
    iconClassName: "bg-amber-50 text-amber-600",
    badgeClassName: "bg-amber-50 text-amber-700",
  };
}

function FieldShell({
  label,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px]/4 font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}

function DisplayField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[112px_minmax(0,1fr)] items-center gap-x-3 border-b border-zinc-100">
      <div className="text-[13px]/5 text-zinc-500">{label}</div>
      <div
        className={cn(
          "min-w-0 truncate text-[14px]/5 font-medium text-zinc-800",
          mono && "break-all font-mono text-xs font-normal text-zinc-700",
        )}
      >
        {value || "--"}
      </div>
    </div>
  );
}

function EditableInputField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[112px_minmax(0,1fr)] items-center gap-x-3 border-b border-zinc-100">
      <div className="text-[13px]/5 text-zinc-500">{label}</div>
      <input
        className="h-9 min-w-0 rounded-[8px] border border-zinc-200 bg-white px-3 text-[14px]/5 font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

function EditableSelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[112px_minmax(0,1fr)] items-center gap-x-3 border-b border-zinc-100">
      <div className="text-[13px]/5 text-zinc-500">{label}</div>
      <SelectMenu
        className="min-w-0"
        onChange={onChange}
        options={options}
        value={value}
      />
    </div>
  );
}

function EditableFieldShell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[112px_minmax(0,1fr)] gap-x-3 border-b border-zinc-100 py-2.5">
      <div className="pt-2 text-[13px]/5 text-zinc-500">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function NumberStepperField({
  disabled = false,
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
  disabled?: boolean;
  className?: string;
}) {
  const applyNextValue = (nextValue: number) => {
    const normalized = Math.min(max, Math.max(min, nextValue));
    onChange(normalized);
  };

  return (
    <FieldShell hint={hint} label={label}>
      <div
        className={cn(
          "flex min-h-10 items-center gap-2 border-b border-zinc-300 bg-white",
          className,
        )}
      >
        <button
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          disabled={disabled}
          onClick={() => applyNextValue(value - step)}
          type="button"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-center text-sm font-medium text-zinc-900 outline-none placeholder:text-zinc-400 focus:outline-none focus:ring-0"
          disabled={disabled}
          max={max}
          min={min}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            if (!Number.isFinite(nextValue)) return;
            applyNextValue(nextValue);
          }}
          step={step}
          type="number"
          value={value}
        />
        <span className="shrink-0 text-sm font-medium text-zinc-500">{suffix}</span>
        <button
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          disabled={disabled}
          onClick={() => applyNextValue(value + step)}
          type="button"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </FieldShell>
  );
}

function DashboardCard({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: {
  icon: typeof Cpu;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex h-full min-h-0 flex-col rounded-[18px] border border-[#dfe6f0] bg-white p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eef5ff] text-blue-600">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[17px]/6 font-semibold text-[#111827]">{title}</div>
            <div className="mt-0.5 text-[12px]/5 text-zinc-500">{description}</div>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function ResourceMetricCard({
  icon: Icon,
  label,
  value,
  suffix,
  usedText,
  percent,
  tone,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  suffix: string;
  usedText: string;
  percent: number;
  tone: "blue" | "violet" | "green";
}) {
  const toneClassName = {
    blue: "bg-blue-600",
    violet: "bg-violet-600",
    green: "bg-emerald-600",
  }[tone];
  const iconClassName = {
    blue: "bg-white text-blue-600",
    violet: "bg-white text-violet-600",
    green: "bg-white text-emerald-600",
  }[tone];
  const shellClassName = {
    blue: "border-blue-100 bg-blue-50/70",
    violet: "border-violet-100 bg-violet-50/70",
    green: "border-emerald-100 bg-emerald-50/70",
  }[tone];

  return (
    <div className={cn("flex h-full min-h-[150px] flex-col justify-between rounded-[14px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", shellClassName)}>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]", iconClassName)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-[15px]/6 font-semibold text-zinc-950">{label}</div>
      </div>
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-[30px]/8 font-semibold tabular-nums text-[#111827]">{value || "--"}</span>
          <span className="text-[15px]/5 text-zinc-700">{suffix}</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 rounded-full bg-white/80">
            <div
              className={cn("h-full rounded-full", toneClassName)}
              style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            />
          </div>
          <span className="w-10 text-right text-[13px]/5 text-zinc-500">{percent}%</span>
        </div>
      </div>
      <div className="text-[13px]/5 text-zinc-500">{usedText}</div>
    </div>
  );
}

function SideCard({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: typeof Info;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside className={cn("flex h-full min-h-0 flex-col rounded-[18px] border border-[#dfe6f0] bg-[#fbfcff] p-5", className)}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
        <div className="min-w-0">
          <div className="text-[17px]/6 font-semibold text-[#111827]">{title}</div>
          {description ? <div className="mt-1 text-[13px]/5 text-zinc-500">{description}</div> : null}
        </div>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}

type SideRowProps = {
  label: string;
  value: ReactNode;
  mono?: boolean;
} & (
  | {
      copyValue: string;
      copyLabel: string;
    }
  | {
      copyValue?: undefined;
      copyLabel?: undefined;
    }
);

function SideRow({
  label,
  value,
  mono = false,
  copyValue,
  copyLabel,
}: SideRowProps) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-4 border-b border-[#e9edf3] py-1 text-[13px]/6 last:border-b-0">
      <div className="shrink-0 text-zinc-500">{label}</div>
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <div className={cn("min-w-0 text-right font-medium leading-6 text-zinc-900", mono && "break-all font-mono text-xs leading-5")}>{value || "--"}</div>
        {copyValue ? (
          <button
            aria-label={copyLabel}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            onClick={() => copyText(copyValue)}
            type="button"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
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

export function AgentSettingsWorkspace({
  editing,
  item,
  template,
  runtimeBlueprint,
  settingsBlueprint,
  workspaceRegion,
  workspaceModelBaseURL,
  workspaceModelKeyReady,
  onRuntimeChange,
  onRuntimePreset,
  onSettingsChange,
  onSettingsFieldChange,
}: AgentSettingsWorkspaceProps) {
  const { locale, t } = useI18n();
  const healthDisplay = resolveHealthDisplay(item, t);
  const HealthIcon = healthDisplay.icon;
  const [customResourceModalOpen, setCustomResourceModalOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(() => ({
    cpu: CPU_OPTIONS[1],
    memory: MEMORY_OPTIONS[1],
  }));
  if (!template) {
    return null;
  }

  const cpuDisplayValue = (() => {
    const normalized = String(runtimeBlueprint.cpu || "").trim();
    if (!normalized) return "";
    if (normalized.toLowerCase().endsWith("m")) {
      const numeric = Number(normalized.slice(0, -1));
      return Number.isFinite(numeric) ? String(numeric / 1000) : normalized;
    }
    return normalized;
  })();
  const cpuSliderValue = resolveNearestStep(Number(cpuDisplayValue), CPU_OPTIONS);

  const memoryDisplayValue = (() => {
    const normalized = String(runtimeBlueprint.memory || "").trim();
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
  const memorySliderValue = resolveNearestStep(Number(memoryDisplayValue), MEMORY_OPTIONS);

  const storageDisplayValue = (() => {
    const normalized = String(runtimeBlueprint.storageLimit || "").trim();
    if (!normalized) return "";
    const lower = normalized.toLowerCase();
    if (lower.endsWith("gi")) return normalized.slice(0, -2);
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
    if (!editing) return;
    setCustomDraft({
      cpu: cpuSliderValue,
      memory: memorySliderValue,
    });
    setCustomResourceModalOpen(true);
  };

  const applyCustomResourceDraft = () => {
    onRuntimePreset("custom");
    onRuntimeChange("cpu", `${customDraft.cpu * 1000}m`);
    onRuntimeChange("memory", `${Math.round(customDraft.memory * 1024)}Mi`);
    setCustomResourceModalOpen(false);
  };

  const resolvedModelBaseURL =
    workspaceModelBaseURL || settingsBlueprint.modelBaseURL;
  const modelPresetHint = !template.modelOptions.length
    ? t('agent.modelPresetEmpty')
    : String(workspaceRegion || "").trim().toLowerCase() === "cn"
      ? t('agent.modelPresetCn')
      : t('agent.modelPresetUs');
  const getPresetLabel = (presetId: string) => {
    if (presetId === "minimum") return t('agent.presetMinimum');
    if (presetId === "recommended") return t('agent.presetRecommended');
    if (presetId === "luxury") return t('agent.presetLuxury');
    if (presetId === "custom") return t('agent.presetCustom');
    return presetId;
  };
  const getFieldLabel = (field: AgentSettingField) => {
    const bindingKey = String(field.binding?.key || "").trim();
    if (bindingKey === "model") return t('agent.model');
    if (bindingKey === "modelProvider") return t('agent.modelProvider');
    if (bindingKey === "modelAPIMode") return "API Mode";
    if (bindingKey === "modelBaseURL") return "Base URL";
    if (bindingKey === "keySource") return t('agent.keySource');
    return field.label;
  };
  const modelSlots = getTemplateModelSlots(template);
  const usesModelSlots = hasTemplateModelSlots(template);
  const handleModelChange = (value: string) => {
    const option =
      template.modelOptions.find((entry) => entry.value === value) || null;
    const modelField = template.settings.agent.find(
      (item) => item.binding.key === "model",
    );
    const providerField = template.settings.agent.find(
      (item) => item.binding.key === "modelProvider",
    );
    const apiModeField = template.settings.agent.find(
      (item) => item.binding.key === "modelAPIMode",
    );

    if (modelField) {
      onSettingsFieldChange(modelField, value);
    } else {
      onSettingsChange("model", value);
    }

    if (providerField) {
      onSettingsFieldChange(providerField, option?.provider || "");
    } else {
      onSettingsChange("modelProvider", option?.provider || "");
    }

    if (apiModeField) {
      onSettingsFieldChange(apiModeField, option?.apiMode || "");
    } else {
      onSettingsChange("modelAPIMode", option?.apiMode || "");
    }
  };
  const handleSlotModelChange = (slotKey: string, value: string) => {
    const option =
      template.modelOptions.find((entry) => entry.value === value) || null;
    onSettingsChange("modelSlots", {
      ...settingsBlueprint.modelSlots,
      [slotKey]: value,
    });

    if (slotKey !== "main") {
      return;
    }

    const modelField = template.settings.agent.find(
      (item) => item.binding.key === "model",
    );
    const providerField = template.settings.agent.find(
      (item) => item.binding.key === "modelProvider",
    );
    const apiModeField = template.settings.agent.find(
      (item) => item.binding.key === "modelAPIMode",
    );

    if (modelField) {
      onSettingsFieldChange(modelField, value);
    } else {
      onSettingsChange("model", value);
    }

    if (providerField) {
      onSettingsFieldChange(providerField, option?.provider || "");
    } else {
      onSettingsChange("modelProvider", option?.provider || "");
    }

    if (apiModeField) {
      onSettingsFieldChange(apiModeField, option?.apiMode || "");
    } else {
      onSettingsChange("modelAPIMode", option?.apiMode || "");
    }
  };

  const orderedAgentFields = [...template.settings.agent].sort((left, right) => {
    const leftKey = String(left.binding?.key || "").trim();
    const rightKey = String(right.binding?.key || "").trim();

    const rank = (key: string) => {
      if (key === "model") return 0;
      if (key === "modelProvider") return 1;
      if (key === "modelAPIMode") return 2;
      if (key === "modelBaseURL") return 3;
      if (key === "keySource") return 4;
      return 10;
    };

    return rank(leftKey) - rank(rightKey);
  });
  const modelField = orderedAgentFields.find(
    (field) => String(field.binding?.key || "").trim() === "model",
  );
  const connectionFields = orderedAgentFields.filter(
    (field) => String(field.binding?.key || "").trim() !== "model",
  ).slice(0, 3);
  const resourcePresetOptions = RESOURCE_PRESETS.filter(
    (preset) => preset.id !== "custom",
  );
  const selectedPresetValue = resourcePresetOptions.some(
    (preset) => preset.id === runtimeBlueprint.profile,
  )
    ? runtimeBlueprint.profile
    : "";

  const renderAgentField = (field: AgentSettingField) => {
    const fieldValue = readBlueprintSettingValue(settingsBlueprint, field);
    const bindingKey = String(field.binding?.key || "").trim();

    if (bindingKey === "modelProvider") {
      return (
        <DisplayField
          label={t('agent.modelProvider')}
          hint={t('agent.autoModelSwitchHint')}
          value={formatModelProviderLabel(fieldValue)}
        />
      );
    }

    if (bindingKey === "modelAPIMode") {
      return (
        <DisplayField
          label="API Mode"
          hint={t('agent.autoModelSwitchHint')}
          value={fieldValue || "--"}
        />
      );
    }

    if (bindingKey === "model" && !usesModelSlots) {
      if (!editing) {
        const option = template.modelOptions.find((entry) => entry.value === fieldValue);
        return (
          <DisplayField
            hint={modelPresetHint}
            label={getFieldLabel(field)}
            value={formatModelOptionLabel(option, t) || fieldValue}
          />
        );
      }

      return (
        <EditableFieldShell
          label={getFieldLabel(field)}
        >
          <ModelCapabilitySelect
            modelTypes={template.modelTypes}
            onChange={handleModelChange}
            options={template.modelOptions}
            placeholder={t('agent.selectModel')}
            value={fieldValue}
          />
        </EditableFieldShell>
      );
    }

    if (bindingKey === "modelBaseURL") {
      return (
        <DisplayField
          label={getFieldLabel(field)}
          hint={t('agent.modelBaseURLHint')}
          mono
          value={resolvedModelBaseURL}
        />
      );
    }

    if (bindingKey === "keySource") {
      const keySourceLabel = formatKeySourceLabel(
        fieldValue,
        workspaceModelKeyReady,
        t,
      );
      return (
        <DisplayField
          label={t('agent.keySource')}
          hint={t('agent.keySourceHint')}
          value={keySourceLabel}
        />
      );
    }

    if (field.type === "select") {
      if (!editing) {
        const option = field.options?.find((entry) => entry.value === fieldValue);
        return (
          <DisplayField
            hint={field.description}
            label={getFieldLabel(field)}
            value={option?.label || fieldValue}
          />
        );
      }

      return (
        <EditableSelectField
          label={getFieldLabel(field)}
          onChange={(value) => onSettingsFieldChange(field, value)}
          options={[
            { label: t('common.select'), value: "" },
            ...(field.options || []).map((option) => ({
              label: option.label,
              value: option.value,
            })),
          ]}
          value={fieldValue}
        />
      );
    }

    if (field.readOnly) {
      return (
        <DisplayField
          hint={field.description}
          label={getFieldLabel(field)}
          value={fieldValue}
        />
      );
    }

    return (
      editing ? (
        <EditableInputField
          label={getFieldLabel(field)}
          onChange={(value) => onSettingsFieldChange(field, value)}
          value={fieldValue}
        />
      ) : (
        <DisplayField
          hint={field.description}
          label={getFieldLabel(field)}
          value={fieldValue}
        />
      )
    );
  };
  const renderModelSlotField = (slot: (typeof modelSlots)[number]) => {
    const value = settingsBlueprint.modelSlots[slot.key] || "";
    const option = template.modelOptions.find((entry) => entry.value === value);
    const label = getTemplateLocalizedText(slot.label, locale);

    if (!editing || slot.mutable === false) {
      return (
        <DisplayField
          label={label}
          value={formatModelOptionLabel(option, t) || value}
        />
      );
    }

    return (
      <EditableFieldShell label={label}>
        <ModelCapabilitySelect
          modelTypes={filterModelTypesForSlot(template.modelTypes, slot)}
          onChange={(nextValue) => handleSlotModelChange(slot.key, nextValue)}
          options={filterModelOptionsForSlot(
            template.modelOptions,
            template.modelTypes,
            slot,
          )}
          placeholder={t('agent.selectModel')}
          value={value}
        />
      </EditableFieldShell>
    );
  };

  return (
    <div className="grid min-h-full min-w-0 grid-cols-[320px_minmax(0,1fr)] grid-rows-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-4">
      <SideCard
      className="col-start-1 row-span-2 row-start-1"
        description={t('agent.instanceOverviewDesc')}
        icon={Activity}
        title={t('agent.instanceOverview')}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5">
          <section className="rounded-[14px] border border-[#dfe6f0] bg-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[12px]/4 font-medium text-zinc-500">{t('agent.currentStatus')}</div>
                <div className="mt-2">
                  <StatusBadge compact status={item.status} />
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-[12px]",
                  healthDisplay.iconClassName,
                )}
              >
                <HealthIcon className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#eef1f6] pt-4">
              <div>
                <div className="text-[12px]/4 text-zinc-500">{t('agent.uptime')}</div>
                <div className="mt-1 truncate text-[14px]/5 font-semibold text-[#111827]">
                  {formatDurationSince(item.contract.core.createdAt || item.updatedAt, t)}
                </div>
              </div>
              <div>
                <div className="text-[12px]/4 text-zinc-500">{t('agent.health')}</div>
                <div
                  className={cn(
                    "mt-1 inline-flex max-w-full items-center gap-1 rounded-[7px] px-2 py-0.5 text-[12px]/4 font-medium",
                    healthDisplay.badgeClassName,
                  )}
                >
                  <HealthIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{healthDisplay.label}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-center gap-2 text-[14px]/5 font-semibold text-[#111827]">
              <FileText className="h-4 w-4 text-blue-600" />
              {t('agent.instanceInfo')}
            </div>
            <div className="flex min-h-0 flex-col rounded-[14px] border border-[#dfe6f0] bg-white px-4">
              <SideRow copyLabel={t('common.copy', { label: t('agent.id') })} copyValue={item.name} label={t('agent.id')} mono value={item.name} />
              <SideRow copyLabel={t('common.copy', { label: t('agent.namespace') })} copyValue={item.namespace} label={t('agent.namespace')} mono value={item.namespace} />
              <SideRow label={t('agent.workDir')} mono value={item.workingDir || template.workingDir} />
              <SideRow label={t('agent.createdAt')} value={formatTime(item.contract.core.createdAt || "")} />
              <SideRow label={t('agent.updatedAt')} value={formatTime(item.updatedAt)} />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2 text-[14px]/5 font-semibold text-[#111827]">
              <Activity className="h-4 w-4 text-emerald-600" />
              {t('agent.runningStatus')}
            </div>
            <div className="rounded-[14px] border border-[#dfe6f0] bg-white px-4">
              <SideRow label={t('agent.restartCount')} value={`0 ${t('agent.unitTimes')}`} />
              <SideRow label={t('agent.runtimeEnv')} value={item.contract.runtime.runtimeClassName || "devbox-runtime"} />
            </div>
          </section>
        </div>
      </SideCard>

      <DashboardCard
        action={
          editing ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px]/4 font-medium text-zinc-500">{t('agent.resourcePreset')}</span>
              <SelectMenu
                className="w-[168px]"
                menuClassName="w-[168px]"
                onChange={(value) => {
                  if (!value) return;
                  onRuntimePreset(value as AgentBlueprint["profile"]);
                }}
                options={[
                  { label: t('agent.selectPreset'), value: "" },
                  ...resourcePresetOptions.map((preset) => ({
                  label: getPresetLabel(preset.id),
                  value: preset.id,
                  })),
                ]}
                value={selectedPresetValue}
              />
              <Button
                className={cn(
                  "h-10 rounded-[8px] px-3 text-[13px] shadow-none",
                  runtimeBlueprint.profile === "custom"
                    ? "border-zinc-900 bg-zinc-900 text-white hover:bg-black"
                    : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                )}
                onClick={openCustomResourceModal}
                type="button"
                variant={runtimeBlueprint.profile === "custom" ? "primary" : "secondary"}
              >
                {t('agent.customResource')}
              </Button>
            </div>
          ) : null
        }
        className="col-start-2 row-start-1"
        description={t('agent.runningResourceDesc')}
        icon={Database}
        title={t('agent.runningResource')}
      >
          <div className="grid h-full grid-cols-3 gap-3">
            <ResourceMetricCard
              icon={Cpu}
              label="CPU"
              percent={20}
              suffix={t('agent.unitCore')}
              tone="blue"
              usedText={t('agent.usedCpu', { used: Number(cpuDisplayValue || 0) * 0.2 || 0.4, total: cpuDisplayValue || "--" })}
              value={cpuDisplayValue}
            />
            <ResourceMetricCard
              icon={Database}
              label={t('agent.memory')}
              percent={60}
              suffix="GiB"
              tone="violet"
              usedText={t('agent.usedMemory', { used: Number(memoryDisplayValue || 0) * 0.6 || 2.4, total: memoryDisplayValue || "--" })}
              value={memoryDisplayValue}
            />
            <div className="min-w-0">
              {editing ? (
                <div className="flex h-full min-h-[150px] flex-col justify-between rounded-[14px] border border-emerald-100 bg-emerald-50/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-emerald-50 text-emerald-600">
                      <HardDrive className="h-5 w-5" />
                    </div>
                    <div className="text-[15px]/6 font-semibold text-zinc-950">{t('agent.storage')}</div>
                  </div>
                  <div>
                    <NumberStepperField
                      className="w-full"
                      hint={t('agent.storageIndependentHint')}
                      label={t('agent.storageCapacity')}
                      max={500}
                      min={1}
                      onChange={(value) => onRuntimeChange("storageLimit", `${value}Gi`)}
                      suffix="GiB"
                      value={storageStepValue}
                    />
                  </div>
                </div>
              ) : (
                <ResourceMetricCard
                  icon={HardDrive}
                  label={t('agent.storage')}
                  percent={40}
                  suffix="GiB"
                  tone="green"
                  usedText={t('agent.usedStorage', { used: Number(storageDisplayValue || 0) * 0.4 || 4, total: storageDisplayValue || "--" })}
                  value={storageDisplayValue}
                />
              )}
            </div>
          </div>
      </DashboardCard>

      <DashboardCard
        className="col-start-2 row-start-2"
        description={t('agent.configDesc')}
        icon={Bot}
        title={t('agent.config')}
      >
        <div className="grid h-full grid-cols-2 gap-4">
          <div className="flex h-full min-h-[150px] flex-col rounded-[14px] border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <div className="mb-3 flex items-center gap-2 text-[15px]/6 font-semibold text-zinc-950">
              <Info className="h-4 w-4 text-zinc-500" />
              {t('agent.basicInfo')}
            </div>
            <div className="flex min-h-0 flex-1 flex-col border-t border-[#e7edf5]">
              {editing ? (
                <EditableInputField
                  label={t('agent.alias')}
                  onChange={(value) =>
                    onSettingsChange("aliasName", value)
                  }
                  placeholder={t('agent.aliasPlaceholder')}
                  value={settingsBlueprint.aliasName}
                />
              ) : (
                <DisplayField label={t('agent.alias')} value={settingsBlueprint.aliasName || item.aliasName || item.name} />
              )}
              {usesModelSlots ? (
                modelSlots.map((slot) => (
                  <div className="py-1" key={slot.key}>
                    {renderModelSlotField(slot)}
                  </div>
                ))
              ) : editing && modelField ? (
                <div className="py-1">{renderAgentField(modelField)}</div>
              ) : (
                <DisplayField
                  label={t('agent.model')}
                  value={
                    formatModelOptionLabel(
                      template.modelOptions.find(
                        (entry) => entry.value === (item.model || settingsBlueprint.model),
                      ),
                      t,
                    ) ||
                    item.model ||
                    settingsBlueprint.model ||
                    "--"
                  }
                />
              )}
              <DisplayField label={t('agent.runtimeEnv')} value={item.contract.runtime.runtimeClassName || "devbox-runtime"} />
            </div>
          </div>

          <div className="flex h-full min-h-[150px] flex-col rounded-[14px] border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <div className="mb-3 flex items-center gap-2 text-[15px]/6 font-semibold text-zinc-950">
              <Link2 className="h-4 w-4 text-zinc-500" />
              {t('agent.modelAndApi')}
            </div>
            {connectionFields.length > 0 ? (
              <div className="flex min-h-0 flex-1 flex-col border-t border-[#e7edf5]">
                {connectionFields.map((field) => (
                  <div className="flex min-h-0 flex-1 flex-col" key={field.key}>{renderAgentField(field)}</div>
                ))}
              </div>
            ) : (
              <div className="rounded-[10px] bg-zinc-50 px-3.5 py-3 text-[12px]/5 text-zinc-500">
                {t('agent.noExtraConfig')}
              </div>
            )}
          </div>
        </div>
      </DashboardCard>

      <Modal
        description={t('agent.customResourceSpecDesc')}
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
        title={t('agent.customResourceSpecTitle')}
        widthClassName="max-w-lg"
      >
        <div className="space-y-8 pt-1">
          <Slider
            label="CPU"
            onChange={(value) =>
              setCustomDraft((current) => ({ ...current, cpu: value }))
            }
            options={CPU_OPTIONS.map((value) => ({
              label: `${value}`,
              value,
            }))}
            unit={t('agent.unitCore')}
            value={customDraft.cpu}
          />
          <Slider
            label={t('agent.memory')}
            onChange={(value) =>
              setCustomDraft((current) => ({ ...current, memory: value }))
            }
            options={MEMORY_OPTIONS.map((value) => ({
              label: `${value}`,
              value,
            }))}
            unit="GiB"
            value={customDraft.memory}
          />
        </div>
      </Modal>
    </div>
  );
}
