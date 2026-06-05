import { formatModelProviderLabel } from "./aiproxy";
import type { TemplateModelOption, TemplateModelType } from "./types";
import type { TranslateFn, TranslationKey } from "../../i18n";

const modalityLabelKeyMap: Record<string, TranslationKey> = {
  text: "model.modality.text",
  image: "model.modality.image",
  vision: "model.modality.vision",
  audio: "model.modality.audio",
  video: "model.modality.video",
  file: "model.modality.file",
  tool: "model.modality.tool",
};

const capabilityLabelKeyMap: Record<string, TranslationKey> = {
  text: "model.capability.text",
  chat: "model.capability.chat",
  reasoning: "model.capability.reasoning",
  vision: "model.capability.vision",
  multimodal: "model.capability.multimodal",
  image_generation: "model.capability.imageGeneration",
  image: "model.capability.image",
  audio: "model.capability.audio",
  asr: "model.capability.asr",
  tts: "model.capability.tts",
  speech_to_text: "model.capability.speechToText",
  text_to_speech: "model.capability.textToSpeech",
  tool: "model.capability.tool",
  code: "model.capability.code",
  agent: "model.capability.agent",
};

const modelTypeLabelKeyMap: Record<string, TranslationKey> = {
  text: "model.type.text",
  multimodal: "model.type.multimodal",
  vision: "model.type.vision",
  image: "model.type.image",
  image_generation: "model.type.image",
  asr: "model.type.asr",
  tts: "model.type.tts",
  audio: "model.type.audio",
  embedding: "model.type.embedding",
  other: "model.type.other",
};

const defaultModelTypeLabels: Record<string, string[]> = {
  text: ["普通模型", "Text Model", "text"],
  multimodal: ["多模态模型", "Multimodal Model", "multimodal"],
  vision: ["视觉理解模型", "Vision Model", "vision"],
  image: ["生图模型", "Image Model", "image"],
  image_generation: ["生图模型", "Image Model", "image generation"],
  asr: ["语音识别模型", "Speech-to-Text Model", "asr"],
  tts: ["语音合成模型", "Text-to-Speech Model", "tts"],
  audio: ["音频模型", "Audio Model", "audio"],
  embedding: ["向量模型", "Embedding Model", "embedding"],
  other: ["其他模型", "Other Models", "other"],
};

const defaultZhModelTypeLabelMap: Record<string, string> = {
  text: "普通模型",
  multimodal: "多模态模型",
  vision: "视觉理解模型",
  image: "生图模型",
  image_generation: "生图模型",
  asr: "语音识别模型",
  tts: "语音合成模型",
  audio: "音频模型",
  embedding: "向量模型",
  other: "其他模型",
};

const defaultZhModalityLabelMap: Record<string, string> = {
  text: "文本",
  image: "图像",
  vision: "视觉",
  audio: "音频",
  video: "视频",
  file: "文件",
  tool: "工具",
};

const defaultZhCapabilityLabelMap: Record<string, string> = {
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
  agent: "Agent",
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

function translatedTokenLabel(
  token: string,
  labelKeys: Record<string, TranslationKey>,
  fallbackLabels: Record<string, string>,
  t?: TranslateFn,
) {
  const normalized = normalizeModelCapabilityToken(token);
  const labelKey = labelKeys[normalized];
  if (labelKey && t) return t(labelKey);
  return fallbackLabels[normalized] || token.replace(/_/g, " ");
}

export function getModelCapabilityBadges(
  option: TemplateModelOption,
  t?: TranslateFn,
) {
  const capabilityBadges = uniqueModelCapabilityTokens(option.capabilities || []).map(
    (token) =>
      translatedTokenLabel(
        token,
        capabilityLabelKeyMap,
        defaultZhCapabilityLabelMap,
        t,
      ),
  );
  const inputBadges = uniqueModelCapabilityTokens(option.inputModalities || []).map(
    (token) =>
      t
        ? t("model.badge.input", {
            value: translatedTokenLabel(
              token,
              modalityLabelKeyMap,
              defaultZhModalityLabelMap,
              t,
            ),
          })
        : `输入:${translatedTokenLabel(
            token,
            modalityLabelKeyMap,
            defaultZhModalityLabelMap,
          )}`,
  );
  const outputBadges = uniqueModelCapabilityTokens(option.outputModalities || []).map(
    (token) =>
      t
        ? t("model.badge.output", {
            value: translatedTokenLabel(
              token,
              modalityLabelKeyMap,
              defaultZhModalityLabelMap,
              t,
            ),
          })
        : `输出:${translatedTokenLabel(
            token,
            modalityLabelKeyMap,
            defaultZhModalityLabelMap,
          )}`,
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

export function formatModelOptionLabel(
  option?: TemplateModelOption | null,
  t?: TranslateFn,
) {
  if (!option) return "";
  const badges = getModelCapabilityBadges(option, t);
  const suffix = badges.length ? ` · ${badges.slice(0, 2).join(" / ")}` : "";
  return `${option.label}${suffix}`;
}

export function getModelTypeLabel(type: string, t?: TranslateFn) {
  const normalized = normalizeModelCapabilityToken(type);
  const labelKey =
    modelTypeLabelKeyMap[normalized as keyof typeof modelTypeLabelKeyMap] ||
    modelTypeLabelKeyMap.other;
  return t
    ? t(labelKey)
    : defaultZhModelTypeLabelMap[normalized] || defaultZhModelTypeLabelMap.other;
}

function shouldLocalizeModelTypeLabel(label: string, key: string) {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) return true;
  const normalizedKey = normalizeModelCapabilityToken(key || "other");
  return (defaultModelTypeLabels[normalizedKey] || []).some(
    (defaultLabel) =>
      normalizeModelCapabilityToken(defaultLabel) ===
      normalizeModelCapabilityToken(normalizedLabel),
  );
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
  t?: TranslateFn,
): TemplateModelType[] {
  const normalized = modelTypes
    .map((type) => {
      const firstModel = type.models?.[0] || null;
      const key = normalizeModelCapabilityToken(
        type.key || (firstModel ? inferModelCategory(firstModel) : ""),
      );
      const models = Array.isArray(type.models) ? type.models : [];
      const label = String(type.label || "").trim();
      return {
        key: key || "other",
        label: shouldLocalizeModelTypeLabel(label, key || "other")
          ? getModelTypeLabel(key || "other", t)
          : label,
        description: type.description,
        models,
      };
    })
    .filter((type) => type.models.length > 0);

  return normalized.length > 0
    ? normalized
    : groupModelOptionsByType(fallbackOptions).map((type) => ({
        ...type,
        label: getModelTypeLabel(type.key, t),
      }));
}

export function flattenModelTypes(modelTypes: TemplateModelType[] = []) {
  return modelTypes.flatMap((type) => type.models || []);
}
