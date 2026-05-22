import {
  Bot,
  Check,
  FileImage,
  Image,
  MessageSquare,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getModelCapabilityBadges,
  getModelCapabilitySummary,
  normalizeModelTypes,
  normalizeModelCapabilityToken,
} from "../../../domains/agents/modelCapabilities";
import type { TemplateModelOption, TemplateModelType } from "../../../domains/agents/types";
import { cn } from "../../../lib/format";

interface ModelCapabilitySelectProps {
  modelTypes?: TemplateModelType[];
  options: TemplateModelOption[];
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

function categoryLabel(category: string) {
  switch (normalizeModelCapabilityToken(category)) {
    case "multimodal":
      return "多模态模型";
    case "image":
    case "image_generation":
      return "生图模型";
    case "audio":
      return "音频模型";
    case "embedding":
      return "向量模型";
    case "text":
      return "普通模型";
    default:
      return "其他模型";
  }
}

function categoryIcon(category: string) {
  switch (normalizeModelCapabilityToken(category)) {
    case "multimodal":
      return FileImage;
    case "image":
    case "image_generation":
      return Image;
    case "audio":
      return Volume2;
    case "text":
      return MessageSquare;
    default:
      return Bot;
  }
}

export function ModelCapabilitySelect({
  modelTypes,
  options,
  value,
  placeholder,
  onChange,
}: ModelCapabilitySelectProps) {
  const normalizedModelTypes = useMemo(
    () => normalizeModelTypes(modelTypes || [], options),
    [modelTypes, options],
  );
  const selectedModelType =
    normalizedModelTypes.find((type) =>
      type.models.some((option) => option.value === value),
    ) || null;
  const previousValueRef = useRef(value);
  const [activeTypeKey, setActiveTypeKey] = useState(
    () => selectedModelType?.key || normalizedModelTypes[0]?.key || "",
  );

  useEffect(() => {
    const valueChanged = previousValueRef.current !== value;
    previousValueRef.current = value;

    setActiveTypeKey((current) =>
      selectedModelType &&
      (valueChanged || !normalizedModelTypes.some((type) => type.key === current))
        ? selectedModelType.key
        : normalizedModelTypes.some((type) => type.key === current)
          ? current
          : normalizedModelTypes[0]?.key || "",
    );
  }, [normalizedModelTypes, selectedModelType, value]);

  const activeType =
    normalizedModelTypes.find((type) => type.key === activeTypeKey) ||
    selectedModelType ||
    normalizedModelTypes[0] ||
    null;
  const activeModels = activeType?.models || [];

  if (!normalizedModelTypes.length) {
    return (
      <div className="rounded-[12px] border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px]/5 text-zinc-500">
        {placeholder}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {normalizedModelTypes.map((modelType) => {
          const Icon = categoryIcon(modelType.key);
          const selected = activeType?.key === modelType.key;
          return (
            <button
              className={cn(
                "min-w-0 rounded-[12px] border px-3 py-2.5 text-left transition",
                selected
                  ? "border-zinc-900 bg-zinc-50 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
              )}
              key={modelType.key}
              onClick={() => {
                setActiveTypeKey(modelType.key);
                if (value && !modelType.models.some((option) => option.value === value)) {
                  onChange("");
                }
              }}
              type="button"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
                <span className="min-w-0 truncate text-[13px]/5 font-semibold text-zinc-950">
                  {modelType.label || categoryLabel(modelType.key)}
                </span>
              </div>
              <div className="mt-1 text-[12px]/5 text-zinc-500">
                {modelType.models.length} 个模型
              </div>
            </button>
          );
        })}
      </div>

      {activeType ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px]/5 font-semibold text-zinc-950">
                {activeType.label || categoryLabel(activeType.key)}
              </div>
              {activeType.description ? (
                <div className="mt-0.5 text-[12px]/5 text-zinc-500">
                  {activeType.description}
                </div>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2">
            {activeModels.map((option) => {
              const selected = option.value === value;
              const badges = getModelCapabilityBadges(option);
              return (
                <button
                  className={cn(
                    "min-w-0 rounded-[12px] border bg-white px-3.5 py-3 text-left transition",
                    selected
                      ? "border-zinc-900 bg-zinc-50 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]"
                      : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50",
                  )}
                  key={option.value}
                  onClick={() => onChange(option.value)}
                  type="button"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[14px]/5 font-semibold text-zinc-950">
                        {option.label}
                      </div>
                      <div className="mt-1 truncate text-[12px]/5 text-zinc-500">
                        {getModelCapabilitySummary(option)}
                      </div>
                    </div>
                    {selected ? (
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </div>
                  {badges.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {badges.map((badge) => (
                        <span
                          className="inline-flex h-6 items-center rounded-full border border-zinc-200 bg-white px-2 text-[11px]/4 font-medium text-zinc-600"
                          key={badge}
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
