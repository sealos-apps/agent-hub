export type ControlSize = "xs" | "sm" | "md";

export const CONTROL_SIZE_CLASSNAME: Record<ControlSize, string> = {
  xs: "h-7 px-2 text-[11px]",
  sm: "h-8 px-2.5 text-[12px]",
  md: "h-10 px-4 text-[14px]",
};

export const FIELD_SIZE_CLASSNAME: Record<ControlSize, string> = {
  xs: "h-7 text-[11px]",
  sm: "h-8 text-[12px]",
  md: "h-10 text-[14px]",
};

export const FIELD_LABEL_CLASSNAME: Record<ControlSize, string> = {
  xs: "text-[11px] font-medium text-[#687386]",
  sm: "text-[11px] font-medium text-[#687386]",
  md: "text-[12px] font-semibold text-[#687386]",
};
