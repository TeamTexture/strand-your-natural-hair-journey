// Global font-scale system. Applies a CSS pixel size to <html>, which all
// rem-based Tailwind utilities inherit from. Persisted in localStorage so the
// preference survives reloads and is applied before React mounts.

export type FontScaleKey = "S" | "M" | "L" | "XL";

export const FONT_SCALE_OPTIONS: { key: FontScaleKey; label: string; px: number }[] = [
  { key: "S", label: "Small", px: 14 },
  { key: "M", label: "Medium", px: 16 },
  { key: "L", label: "Large", px: 18 },
  { key: "XL", label: "Extra large", px: 20 },
];

const STORAGE_KEY = "strand_font_scale";
const DEFAULT: FontScaleKey = "M";

const isFontScaleKey = (v: unknown): v is FontScaleKey =>
  v === "S" || v === "M" || v === "L" || v === "XL";

export const getFontScale = (): FontScaleKey => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isFontScaleKey(raw)) return raw;
  } catch {}
  return DEFAULT;
};

export const applyFontScale = (key: FontScaleKey) => {
  const opt = FONT_SCALE_OPTIONS.find((o) => o.key === key) ?? FONT_SCALE_OPTIONS[1];
  if (typeof document !== "undefined") {
    document.documentElement.style.fontSize = `${opt.px}px`;
    document.documentElement.dataset.fontScale = key;
  }
};

export const setFontScale = (key: FontScaleKey) => {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {}
  applyFontScale(key);
};
