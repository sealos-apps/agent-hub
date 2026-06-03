import {
  Bot,
  Check,
  ChevronDown,
  FileImage,
  Image,
  MessageSquare,
  Volume2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  getModelCapabilityBadges,
  getModelCapabilitySummary,
  normalizeModelTypes,
  normalizeModelCapabilityToken,
  getModelTypeLabel,
} from "../../../domains/agents/modelCapabilities";
import type { TemplateModelOption, TemplateModelType } from "../../../domains/agents/types";
import { useI18n } from "../../../i18n";
import { cn } from "../../../lib/format";

interface ModelCapabilitySelectProps {
  modelTypes?: TemplateModelType[];
  options: TemplateModelOption[];
  value: string;
  placeholder: string;
  fallbackLabel?: string;
  portal?: boolean;
  onChange: (value: string) => void;
}

const PORTAL_MENU_GAP = 8;
const PORTAL_MENU_MAX_HEIGHT = 416;
const PORTAL_MENU_MIN_HEIGHT = 240;
const PORTAL_MENU_VIEWPORT_PADDING = 24;

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

function resolveMenuLayout(
  rect: DOMRect,
  portal: boolean,
): { placement: "down" | "up"; style: CSSProperties } {
  const availableBelow = Math.max(
    0,
    window.innerHeight - rect.bottom - PORTAL_MENU_GAP - PORTAL_MENU_VIEWPORT_PADDING,
  );
  const availableAbove = Math.max(
    0,
    rect.top - PORTAL_MENU_GAP - PORTAL_MENU_VIEWPORT_PADDING,
  );
  const placement: "down" | "up" =
    availableBelow < PORTAL_MENU_MIN_HEIGHT && availableAbove > availableBelow
      ? "up"
      : "down";
  const availableHeight = placement === "up" ? availableAbove : availableBelow;
  const baseStyle: CSSProperties = {
    boxSizing: "border-box",
    maxHeight: Math.min(PORTAL_MENU_MAX_HEIGHT, availableHeight),
    overscrollBehavior: "contain",
  };

  if (!portal) {
    return {
      placement,
      style:
        placement === "up"
          ? {
              ...baseStyle,
              bottom: `calc(100% + ${PORTAL_MENU_GAP}px)`,
            }
          : baseStyle,
    };
  }

  return {
    placement,
    style: {
      ...baseStyle,
      bottom:
        placement === "up"
          ? window.innerHeight - rect.top + PORTAL_MENU_GAP
          : undefined,
      left: rect.left,
      position: "fixed" as CSSProperties["position"],
      top: placement === "up" ? undefined : rect.bottom + PORTAL_MENU_GAP,
      width: rect.width,
      zIndex: 80,
    },
  };
}

export function ModelCapabilitySelect({
  modelTypes,
  options,
  value,
  placeholder,
  fallbackLabel,
  portal = false,
  onChange,
}: ModelCapabilitySelectProps) {
  const { t } = useI18n();
  const normalizedModelTypes = useMemo(
    () => normalizeModelTypes(modelTypes || [], options, t),
    [modelTypes, options, t],
  );
  const selectedModelType =
    normalizedModelTypes.find((type) =>
      type.models.some((option) => option.value === value),
    ) || null;
  const previousValueRef = useRef(value);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedOption =
    options.find((option) => option.value === value) || null;
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({
    boxSizing: "border-box",
    maxHeight: PORTAL_MENU_MAX_HEIGHT,
    overscrollBehavior: "contain",
  });
  const [menuPlacement, setMenuPlacement] = useState<"down" | "up">("down");
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
  const showTypeList = normalizedModelTypes.length > 1;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const updatePortalPosition = useCallback(() => {
    if (!rootRef.current) return;

    const { placement, style } = resolveMenuLayout(
      rootRef.current.getBoundingClientRect(),
      portal,
    );
    setMenuPlacement(placement);
    setMenuStyle(style);
  }, [portal]);

  useLayoutEffect(() => {
    if (!open) return;

    const handleWindowScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) {
        return;
      }
      updatePortalPosition();
    };

    updatePortalPosition();
    window.addEventListener("resize", updatePortalPosition);
    window.addEventListener("scroll", handleWindowScroll, true);

    return () => {
      window.removeEventListener("resize", updatePortalPosition);
      window.removeEventListener("scroll", handleWindowScroll, true);
    };
  }, [open, updatePortalPosition]);

  if (!normalizedModelTypes.length) {
    return (
      <div className="rounded-[12px] border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px]/5 text-zinc-500">
        {placeholder}
      </div>
    );
  }

  const menu = open ? (
    <div
      className={cn(
        "overflow-hidden rounded-[12px] border border-zinc-200 bg-white shadow-[0_18px_42px_-20px_rgba(15,23,42,0.35)]",
        portal
          ? ""
          : menuPlacement === "up"
            ? "absolute left-0 right-0 z-30"
            : "absolute left-0 right-0 z-30 mt-2",
      )}
      data-testid="model-capability-menu"
      ref={menuRef}
      style={menuStyle}
    >
      <div
        className={cn(
          "grid max-h-[inherit] overflow-hidden",
          showTypeList ? "grid-cols-[148px_minmax(0,1fr)]" : "grid-cols-1",
        )}
      >
        {showTypeList ? (
          <div className="max-h-[inherit] overflow-y-auto overscroll-contain border-r border-zinc-200 bg-zinc-50/70 p-1.5">
            {normalizedModelTypes.map((modelType) => {
              const Icon = categoryIcon(modelType.key);
              const selected = activeType?.key === modelType.key;
              return (
                <button
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 rounded-[8px] px-2.5 py-2 text-left transition",
                    selected
                      ? "bg-white text-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      : "text-zinc-600 hover:bg-white/80 hover:text-zinc-950",
                  )}
                  key={modelType.key}
                  onClick={() => setActiveTypeKey(modelType.key)}
                  type="button"
                >
                  <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate text-[12px]/5 font-semibold">
                    {modelType.label || getModelTypeLabel(modelType.key, t)}
                  </span>
                  <span className="shrink-0 text-[11px]/4 text-zinc-400">
                    {modelType.models.length}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex max-h-[inherit] min-w-0 flex-col p-1.5">
          {activeType ? (
            <div className="shrink-0 border-b border-zinc-100 px-2 pb-2 pt-1.5">
              <div className="truncate text-[13px]/5 font-semibold text-zinc-950">
                {activeType.label || getModelTypeLabel(activeType.key, t)}
              </div>
              {activeType.description ? (
                <div className="mt-0.5 line-clamp-2 text-[12px]/5 text-zinc-500">
                  {activeType.description}
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-1.5"
            data-testid="model-capability-model-list"
          >
            {activeModels.map((option) => {
              const selected = option.value === value;
              const badges = getModelCapabilityBadges(option, t).slice(0, 4);
              return (
                <button
                  className={cn(
                    "flex w-full min-w-0 items-start gap-3 rounded-[8px] px-2.5 py-2.5 text-left transition",
                    selected
                      ? "bg-zinc-100 text-zinc-950"
                      : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950",
                  )}
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]/5 font-semibold">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px]/5 text-zinc-500">
                      {getModelCapabilitySummary(option)}
                    </span>
                    {badges.length ? (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {badges.map((badge) => (
                          <span
                            className="inline-flex h-5 items-center rounded-md border border-zinc-200 bg-white px-1.5 text-[10px]/4 font-medium text-zinc-600"
                            key={badge}
                          >
                            {badge}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  {selected ? (
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-3 rounded-[10px] border bg-white px-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition",
          "focus:outline-none focus-visible:border-[rgba(37,99,255,0.45)] focus-visible:ring-1 focus-visible:ring-[rgba(37,99,255,0.16)]",
          open
            ? "border-[rgba(37,99,255,0.45)] ring-1 ring-[rgba(37,99,255,0.16)]"
            : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50",
        )}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[14px]/5 font-semibold",
              selectedOption || fallbackLabel ? "text-zinc-950" : "text-zinc-500",
            )}
          >
            {selectedOption?.label || fallbackLabel || placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-zinc-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
