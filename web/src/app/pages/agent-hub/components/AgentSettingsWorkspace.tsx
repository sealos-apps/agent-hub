import { HardDrive, Minus, Plus, Server, Settings2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { readBlueprintSettingValue } from "../../../../domains/agents/blueprintFields";
import { formatModelProviderLabel } from "../../../../domains/agents/aiproxy";
import { createBlueprintFromAgentItem } from "../../../../domains/agents/mappers";
import {
  describeRegionModelPreset,
  RESOURCE_PRESETS,
} from "../../../../domains/agents/templates";
import type {
  AgentBlueprint,
  AgentHubRegion,
  AgentListItem,
  AgentSettingField,
  AgentTemplateDefinition,
} from "../../../../domains/agents/types";
import { cn } from "../../../../lib/format";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Modal } from "../../../../components/ui/Modal";
import { SelectMenu } from "../../../../components/ui/SelectMenu";
import { Slider } from "../../../../components/ui/Slider";

interface AgentSettingsWorkspaceProps {
  item: AgentListItem;
  template: AgentTemplateDefinition | null;
  runtimeBlueprint: AgentBlueprint;
  settingsBlueprint: AgentBlueprint;
  workspaceRegion: AgentHubRegion | string;
  workspaceModelBaseURL: string;
  workspaceModelKeyReady: boolean;
  submitting: boolean;
  onRuntimeChange: (field: keyof AgentBlueprint, value: string) => void;
  onRuntimePreset: (presetId: AgentBlueprint["profile"]) => void;
  onSaveRuntime: () => void;
  onSettingsChange: (field: keyof AgentBlueprint, value: string) => void;
  onSettingsFieldChange: (field: AgentSettingField, value: string) => void;
  onSaveSettings: () => void;
}

function formatKeySourceLabel(value = "", ready = false) {
  if (!ready) return "未准备";
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "unset") return "未准备";
  if (normalized === "workspace-aiproxy") return "由工作区提供";
  return value;
}

function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("workbench-card flex flex-col rounded-[16px] p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[16px] font-semibold tracking-[-0.01em] text-zinc-950">{title}</div>
          <div className="mt-1.5 text-sm leading-6 text-zinc-500">{description}</div>
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-zinc-800">{label}</span>
      {children}
      {hint ? <span className="text-[11px]/5 text-zinc-500">{hint}</span> : null}
    </label>
  );
}

function DisplayField({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] font-medium text-zinc-800">{label}</div>
      <div
        className={cn(
          "min-h-10 rounded-[10px] bg-zinc-50 px-4 py-2.5 text-[14px]/5 text-zinc-700",
          mono && "break-all font-mono text-xs text-zinc-700",
        )}
      >
        {value || "--"}
      </div>
      {hint ? <div className="text-[11px]/5 text-zinc-500">{hint}</div> : null}
    </div>
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
    <FieldShell hint={hint} label={label}>
      <div
        className={cn(
          "flex min-h-10 items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
          className,
        )}
      >
        <button
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          onClick={() => applyNextValue(value - step)}
          type="button"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-center text-sm font-medium text-zinc-900 outline-none placeholder:text-zinc-400 focus:outline-none focus:ring-0"
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
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          onClick={() => applyNextValue(value + step)}
          type="button"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </FieldShell>
  );
}

function MetaPill({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: typeof HardDrive;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border-[0.5px] border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-[0.5px] border-zinc-200 bg-white text-zinc-500">
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
          {label}
        </div>
        <div
          className={cn(
            "mt-1 truncate text-[13px]/5 font-medium text-zinc-900",
            mono && "font-mono text-xs text-zinc-700",
          )}
        >
          {value || "--"}
        </div>
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
  item,
  template,
  runtimeBlueprint,
  settingsBlueprint,
  workspaceRegion,
  workspaceModelBaseURL,
  workspaceModelKeyReady,
  submitting,
  onRuntimeChange,
  onRuntimePreset,
  onSaveRuntime,
  onSettingsChange,
  onSettingsFieldChange,
  onSaveSettings,
}: AgentSettingsWorkspaceProps) {
  const [customResourceModalOpen, setCustomResourceModalOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(() => ({
    cpu: CPU_OPTIONS[1],
    memory: MEMORY_OPTIONS[1],
  }));
  const agentSettingsFields = useMemo(() => template?.settings.agent ?? [], [template]);
  const originalBlueprint = useMemo(() => createBlueprintFromAgentItem(item), [item]);

  const runtimeDirty = useMemo(
    () =>
      runtimeBlueprint.profile !== originalBlueprint.profile ||
      runtimeBlueprint.cpu !== originalBlueprint.cpu ||
      runtimeBlueprint.memory !== originalBlueprint.memory ||
      runtimeBlueprint.storageLimit !== originalBlueprint.storageLimit,
    [originalBlueprint, runtimeBlueprint],
  );

  const settingsDirty = useMemo(
    () =>
      settingsBlueprint.aliasName !== originalBlueprint.aliasName ||
      settingsBlueprint.model !== originalBlueprint.model ||
      settingsBlueprint.modelProvider !== originalBlueprint.modelProvider ||
      settingsBlueprint.modelBaseURL !== originalBlueprint.modelBaseURL ||
      settingsBlueprint.keySource !== originalBlueprint.keySource ||
      agentSettingsFields.some((field) => {
        const current = readBlueprintSettingValue(settingsBlueprint, field);
        const original = readBlueprintSettingValue(originalBlueprint, field);
        return current !== original;
      }),
    [agentSettingsFields, originalBlueprint, settingsBlueprint],
  );

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
  const modelPresetHint = describeRegionModelPreset(
    String(workspaceRegion || "")
      .trim()
      .toLowerCase() === "cn"
      ? "cn"
      : "us",
    template,
  );
  const handleModelChange = (value: string) => {
    const option =
      template.modelOptions.find((entry) => entry.value === value) || null;
    const modelField = template.settings.agent.find(
      (item) => item.binding.key === "model",
    );
    const providerField = template.settings.agent.find(
      (item) => item.binding.key === "modelProvider",
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
  };

  const orderedAgentFields = [...template.settings.agent].sort((left, right) => {
    const leftKey = String(left.binding?.key || "").trim();
    const rightKey = String(right.binding?.key || "").trim();

    const rank = (key: string) => {
      if (key === "model") return 0;
      if (key === "modelProvider") return 1;
      return 10;
    };

    return rank(leftKey) - rank(rightKey);
  });

  const renderAgentField = (field: AgentSettingField) => {
    const fieldValue = readBlueprintSettingValue(settingsBlueprint, field);
    const bindingKey = String(field.binding?.key || "").trim();

    if (bindingKey === "modelProvider") {
      return (
        <DisplayField
          label="模型渠道"
          hint="该字段会随模型自动切换。"
          value={formatModelProviderLabel(fieldValue)}
        />
      );
    }

    if (bindingKey === "model") {
      return (
        <FieldShell hint={modelPresetHint} label={field.label}>
          <SelectMenu
            className="w-full"
            onChange={handleModelChange}
            options={[
              { label: "请选择模型", value: "" },
              ...template.modelOptions.map((option) => ({
                label: option.helper ? `${option.label} · ${option.helper}` : option.label,
                value: option.value,
              })),
            ]}
            value={fieldValue}
          />
        </FieldShell>
      );
    }

    if (bindingKey === "modelBaseURL") {
      return (
        <DisplayField
          label={field.label}
          hint="这里展示并提交当前 Agent 的模型入口地址。"
          mono
          value={resolvedModelBaseURL}
        />
      );
    }

    if (bindingKey === "keySource") {
      const keySourceLabel = formatKeySourceLabel(
        fieldValue,
        workspaceModelKeyReady,
      );
      return (
        <DisplayField
          label="密钥来源"
          hint="这里仅展示密钥来源，密钥内容不会显示在页面上。"
          value={keySourceLabel}
        />
      );
    }

    if (field.type === "select") {
      return (
        <FieldShell hint={field.description} label={field.label}>
          <SelectMenu
            className="w-full"
            onChange={(value) => onSettingsFieldChange(field, value)}
            options={[
              { label: "请选择", value: "" },
              ...(field.options || []).map((option) => ({
                label: option.label,
                value: option.value,
              })),
            ]}
            value={fieldValue}
          />
        </FieldShell>
      );
    }

    if (field.readOnly) {
      return (
        <DisplayField
          hint={field.description}
          label={field.label}
          value={fieldValue}
        />
      );
    }

    return (
      <Input
        className="h-10 w-full rounded-[10px] border-zinc-200 bg-white px-4 text-[14px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        hint={field.description}
        label={field.label}
        onChange={(event) => onSettingsFieldChange(field, event.target.value)}
        value={fieldValue}
      />
    );
  };

  return (
    <div className="workbench-card-strong flex h-full min-h-0 flex-col overflow-y-auto rounded-[16px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[18px]/7 font-semibold tracking-[-0.01em] text-zinc-950">
            实例设置
          </div>
          <div className="mt-2 text-sm leading-6 text-zinc-500">
            在这里调整资源规格和 Agent 运行参数。
          </div>
        </div>
        <div className="rounded-full border-[0.5px] border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px]/4 font-medium text-zinc-600">
          {template.name}
        </div>
      </div>

      <div className="mt-5 grid gap-2.5 min-[960px]:grid-cols-2 min-[1280px]:grid-cols-3">
        <MetaPill icon={Server} label="实例名称" mono value={item.name} />
        <MetaPill
          icon={Settings2}
          label="命名空间"
          mono
          value={item.namespace}
        />
        <MetaPill
          icon={HardDrive}
          label="工作目录"
          mono
          value={item.workingDir || template.workingDir}
        />
      </div>

      <div className="mt-5 grid min-w-0 gap-5 min-[1180px]:grid-cols-[minmax(360px,0.92fr)_minmax(380px,1.08fr)]">
        <SectionCard
          actions={
            <Button
              className={cn(
                "h-10 rounded-[8px] px-4 text-[14px] leading-5",
                runtimeDirty
                  ? "bg-[#18181b] text-white hover:bg-black"
                  : "border-zinc-200 bg-zinc-100 text-zinc-400 shadow-none hover:bg-zinc-100 hover:text-zinc-400",
              )}
              disabled={!runtimeDirty || submitting}
              onClick={onSaveRuntime}
              size="md"
              type="button"
              variant={runtimeDirty ? "primary" : "secondary"}
            >
              {submitting ? "保存中..." : "保存运行时"}
            </Button>
          }
          description="容器规格"
          title="运行资源"
        >
          <div className="grid grid-cols-2 gap-2.5">
            {RESOURCE_PRESETS.map((preset) => {
              const active = runtimeBlueprint.profile === preset.id;
              const showCustomEdit = active && preset.id === "custom";
              return (
                <button
                  className={cn(
                    "flex min-h-[84px] flex-col rounded-xl border px-3.5 py-3.5 text-left transition",
                    active
                      ? "border-zinc-900 bg-zinc-50 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                  )}
                  key={preset.id}
                  onClick={() => {
                    if (preset.id === "custom") {
                      openCustomResourceModal();
                      return;
                    }
                    onRuntimePreset(preset.id);
                  }}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-zinc-950">
                      {preset.label}
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
                      {showCustomEdit ? "点击修改" : "当前"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-zinc-500">{preset.description}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricDisplayField
                className="w-full"
                label="CPU"
                suffix="核"
                value={cpuDisplayValue}
              />
              <MetricDisplayField
                className="w-full"
                label="内存"
                suffix="GiB"
                value={memoryDisplayValue}
              />
              <NumberStepperField
                className="w-full"
                hint="存储独立于预设规格，可单独调整。"
                label="存储"
                max={500}
                min={1}
                onChange={(value) => onRuntimeChange("storageLimit", `${value}Gi`)}
                suffix="GiB"
                value={storageStepValue}
              />
            </div>
          </div>

          <div className="mt-2.5 rounded-xl border-[0.5px] border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px]/5 text-zinc-500">
            当前运行环境为{" "}
            <span className="font-medium text-zinc-700">
              {item.contract.runtime.runtimeClassName || "devbox-runtime"}
            </span>
            。
          </div>
        </SectionCard>

        <SectionCard
          actions={
            <Button
              className={cn(
                "h-10 rounded-[8px] px-4 text-[14px] leading-5",
                settingsDirty
                  ? "bg-[#18181b] text-white hover:bg-black"
                  : "border-zinc-200 bg-zinc-100 text-zinc-400 shadow-none hover:bg-zinc-100 hover:text-zinc-400",
              )}
              disabled={!settingsDirty || submitting}
              onClick={onSaveSettings}
              size="md"
              type="button"
              variant={settingsDirty ? "primary" : "secondary"}
            >
              {submitting ? "保存中..." : "保存 Agent 设置"}
            </Button>
          }
          description="模型与接入"
          title="Agent 配置"
        >
          <div className="flex flex-col gap-2.5">
            <FieldShell label="别名">
              <Input
                className="h-10 w-full rounded-[10px] border-zinc-200 bg-white px-4 text-[14px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                onChange={(event) =>
                  onSettingsChange("aliasName", event.target.value)
                }
                placeholder="例如：客服助手"
                value={settingsBlueprint.aliasName}
              />
            </FieldShell>

            {orderedAgentFields.length > 0 ? (
              <div className="grid gap-2.5 min-[960px]:grid-cols-2">
                {orderedAgentFields.map((field) => (
                  <div key={field.key}>{renderAgentField(field)}</div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border-[0.5px] border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[11px]/5 text-zinc-500">
                当前模板没有额外 Agent 配置项。
              </div>
            )}
          </div>

        </SectionCard>
      </div>

      <Modal
        description="自定义时仅调整 CPU 与内存，存储可在页面中独立设置。"
        footer={
          <>
            <Button
              onClick={() => setCustomResourceModalOpen(false)}
              type="button"
              variant="secondary"
            >
              取消
            </Button>
            <Button onClick={applyCustomResourceDraft} type="button">
              应用设置
            </Button>
          </>
        }
        onClose={() => setCustomResourceModalOpen(false)}
        open={customResourceModalOpen}
        title="自定义资源规格"
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
            unit="核"
            value={customDraft.cpu}
          />
          <Slider
            label="内存"
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
