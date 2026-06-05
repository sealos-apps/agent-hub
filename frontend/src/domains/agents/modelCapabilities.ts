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

const defaultModelTypeLabelAliases: Record<string, string[]> = {
  text: ["Text Model", "text", "\u666e\u901a\u6a21\u578b"],
  multimodal: ["Multimodal Model", "multimodal", "\u591a\u6a21\u6001\u6a21\u578b"],
  vision: ["Vision Model", "vision", "\u89c6\u89c9\u7406\u89e3\u6a21\u578b"],
  image: ["Image Model", "image", "\u751f\u56fe\u6a21\u578b"],
  image_generation: ["Image Model", "image generation", "\u751f\u56fe\u6a21\u578b"],
  asr: ["Speech-to-Text Model", "asr", "\u8bed\u97f3\u8bc6\u522b\u6a21\u578b"],
  tts: ["Text-to-Speech Model", "tts", "\u8bed\u97f3\u5408\u6210\u6a21\u578b"],
  audio: ["Audio Model", "audio", "\u97f3\u9891\u6a21\u578b"],
  embedding: ["Embedding Model", "embedding", "\u5411\u91cf\u6a21\u578b"],
  other: ["Other Models", "other", "\u5176\u4ed6\u6a21\u578b"],
};

const defaultModelTypeLabelMap: Record<string, string> = {
  text: "Text Model",
  multimodal: "Multimodal Model",
  vision: "Vision Model",
  image: "Image Model",
  image_generation: "Image Model",
  asr: "Speech-to-Text Model",
  tts: "Text-to-Speech Model",
  audio: "Audio Model",
  embedding: "Embedding Model",
  other: "Other Models",
};

const defaultModalityLabelMap: Record<string, string> = {
  text: "Text",
  image: "Image",
  vision: "Vision",
  audio: "Audio",
  video: "Video",
  file: "File",
  tool: "Tool",
};

const defaultCapabilityLabelMap: Record<string, string> = {
  text: "Text",
  chat: "Chat",
  reasoning: "Reasoning",
  vision: "Vision",
  multimodal: "Multimodal",
  image_generation: "Image generation",
  image: "Image",
  audio: "Audio",
  asr: "Speech to text",
  tts: "Text to speech",
  speech_to_text: "Speech to text",
  text_to_speech: "Text to speech",
  tool: "Tool",
  code: "Code",
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
        defaultCapabilityLabelMap,
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
              defaultModalityLabelMap,
              t,
            ),
          })
        : `Input:${translatedTokenLabel(
            token,
            modalityLabelKeyMap,
            defaultModalityLabelMap,
          )}`,
  );
  const outputBadges = uniqueModelCapabilityTokens(option.outputModalities || []).map(
    (token) =>
      t
        ? t("model.badge.output", {
            value: translatedTokenLabel(
              token,
              modalityLabelKeyMap,
              defaultModalityLabelMap,
              t,
            ),
          })
        : `Output:${translatedTokenLabel(
            token,
            modalityLabelKeyMap,
            defaultModalityLabelMap,
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
    : defaultModelTypeLabelMap[normalized] || defaultModelTypeLabelMap.other;
}

function shouldLocalizeModelTypeLabel(label: string, key: string) {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) return true;
  const normalizedKey = normalizeModelCapabilityToken(key || "other");
  return (defaultModelTypeLabelAliases[normalizedKey] || []).some(
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
