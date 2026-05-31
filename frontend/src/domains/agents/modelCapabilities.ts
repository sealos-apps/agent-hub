import { formatModelProviderLabel } from "./aiproxy";
import type { TemplateModelOption, TemplateModelType } from "./types";

const modalityLabelMap: Record<string, string> = {
  text: "文本",
  image: "图像",
  vision: "视觉",
  audio: "音频",
  video: "视频",
  file: "文件",
  tool: "工具",
};

const capabilityLabelMap: Record<string, string> = {
  text: "文本",
  chat: "对话",
  reasoning: "推理",
  vision: "视觉",
  multimodal: "多模态",
  image_generation: "生图",
  image: "图像",
  audio: "音频",
  asr: "语音识别",
  tts: "语音合成",
  speech_to_text: "语音识别",
  text_to_speech: "语音合成",
  tool: "工具",
  code: "代码",
};

export function normalizeModelCapabilityToken(value = "") {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function uniqueModelCapabilityTokens(values: string[] = []) {
  const seen = new Set<string>();
  return values
    .map(normalizeModelCapabilityToken)
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

export function inferModelCategory(option: TemplateModelOption) {
  const category = normalizeModelCapabilityToken(option.category || "");
  if (category) return category;

  const capabilities = uniqueModelCapabilityTokens([
    ...(option.capabilities || []),
    option.apiMode || "",
    option.kind || "",
  ]);
  const inputModalities = uniqueModelCapabilityTokens(option.inputModalities || []);
  const outputModalities = uniqueModelCapabilityTokens(option.outputModalities || []);
  const tokens = [...capabilities, ...inputModalities, ...outputModalities];
  if (
    capabilities.some((token) => token.includes("image_generation")) ||
    outputModalities.includes("image")
  ) {
    return "image";
  }
  if (
    tokens.some(
      (token) =>
        token === "image" || token === "vision" || token === "multimodal",
    )
  ) {
    return "multimodal";
  }
  if (tokens.some((token) => token === "audio")) {
    return "audio";
  }
  return "text";
}

function tokenLabel(token: string, labels: Record<string, string>) {
  const normalized = normalizeModelCapabilityToken(token);
  return labels[normalized] || token.replace(/_/g, " ");
}

export function getModelCapabilityBadges(option: TemplateModelOption) {
  const capabilityBadges = uniqueModelCapabilityTokens(option.capabilities || []).map(
    (token) => tokenLabel(token, capabilityLabelMap),
  );
  const inputBadges = uniqueModelCapabilityTokens(option.inputModalities || []).map(
    (token) => `输入:${tokenLabel(token, modalityLabelMap)}`,
  );
  const outputBadges = uniqueModelCapabilityTokens(option.outputModalities || []).map(
    (token) => `输出:${tokenLabel(token, modalityLabelMap)}`,
  );
  return [...capabilityBadges, ...inputBadges, ...outputBadges].slice(0, 6);
}

export function getModelCapabilitySummary(option: TemplateModelOption) {
  const parts = [
    option.helper,
    formatModelProviderLabel(option.provider),
    option.apiMode,
    option.kind,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return parts.join(" · ");
}

export function formatModelOptionLabel(option?: TemplateModelOption | null) {
  if (!option) return "";
  const badges = getModelCapabilityBadges(option);
  const suffix = badges.length ? ` · ${badges.slice(0, 2).join(" / ")}` : "";
  return `${option.label}${suffix}`;
}

export function getModelTypeLabel(type: string) {
  switch (normalizeModelCapabilityToken(type)) {
    case "multimodal":
      return "多模态模型";
    case "image":
    case "image_generation":
      return "生图模型";
    case "asr":
      return "语音识别模型";
    case "tts":
      return "语音合成模型";
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

const modelTypeOrder = ["text", "multimodal", "image", "asr", "tts", "audio", "embedding", "other"];

export function groupModelOptionsByType(
  options: TemplateModelOption[] = [],
): TemplateModelType[] {
  const groups = new Map<string, TemplateModelOption[]>();
  for (const option of options) {
    const type = inferModelCategory(option) || "text";
    groups.set(type, [...(groups.get(type) || []), option]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftIndex = modelTypeOrder.indexOf(left);
      const rightIndex = modelTypeOrder.indexOf(right);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    })
    .map(([key, models]) => ({
      key,
      label: getModelTypeLabel(key),
      models,
    }));
}

export function normalizeModelTypes(
  modelTypes: TemplateModelType[] = [],
  fallbackOptions: TemplateModelOption[] = [],
): TemplateModelType[] {
  const normalized = modelTypes
    .map((type) => {
      const firstModel = type.models?.[0] || null;
      const key = normalizeModelCapabilityToken(
        type.key || (firstModel ? inferModelCategory(firstModel) : ""),
      );
      const models = Array.isArray(type.models) ? type.models : [];
      return {
        key: key || "other",
        label: String(type.label || getModelTypeLabel(key || "other")),
        description: type.description,
        models,
      };
    })
    .filter((type) => type.models.length > 0);

  return normalized.length > 0 ? normalized : groupModelOptionsByType(fallbackOptions);
}

export function flattenModelTypes(modelTypes: TemplateModelType[] = []) {
  return modelTypes.flatMap((type) => type.models || []);
}
