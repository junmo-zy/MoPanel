export type BuiltInWallpaperId = "coastal-mist" | "blue-fjord" | "warm-dunes";
export type WallpaperId = BuiltInWallpaperId | "custom";

export interface WallpaperDefinition {
  id: BuiltInWallpaperId;
  name: string;
  url: string;
}

export interface WallpaperPreferences {
  selectedId: WallpaperId;
  // Blur of the wallpaper image itself, in px.
  blur: number;
  // Strength of the veil over the wallpaper, in %: darkens in dark mode,
  // lightens in light mode, so page text stays readable.
  dim: number;
  // Glass material level as a percentage; one of GLASS_LEVELS' values.
  glass: number;
  // Built-in wallpapers the user removed from the list.
  hidden: BuiltInWallpaperId[];
}

export const WALLPAPER_LIMITS = {
  blur: { min: 0, max: 60 },
  dim: { min: 0, max: 90 },
  glass: { min: 10, max: 95 },
} as const;

// Apple-style material levels (ultra thin → thick). The panel never offers
// arbitrary opacity: too little tint makes text unreadable on busy wallpapers.
export const GLASS_LEVELS = [
  { value: 25, label: "超薄", hint: "最通透，适合安静、颜色单一的壁纸" },
  { value: 45, label: "轻薄", hint: "能看到更多壁纸，文字依旧清楚" },
  { value: 65, label: "标准", hint: "平衡通透感与文字清晰度" },
  { value: 85, label: "浓厚", hint: "最易读，适合花哨或明亮的壁纸" },
] as const;

export function snapGlass(value: number) {
  return GLASS_LEVELS.reduce((best, level) => (
    Math.abs(level.value - value) < Math.abs(best - value) ? level.value : best
  ), GLASS_LEVELS[2].value as number);
}

export const BUILT_IN_WALLPAPERS: WallpaperDefinition[] = [
  { id: "coastal-mist", name: "清晨海雾", url: "/wallpapers/coastal-mist.png" },
  { id: "blue-fjord", name: "蓝色峡湾", url: "/wallpapers/blue-fjord.png" },
  { id: "warm-dunes", name: "暖色沙丘", url: "/wallpapers/warm-dunes.png" },
];

export const DEFAULT_WALLPAPER_PREFERENCES: WallpaperPreferences = {
  selectedId: "coastal-mist",
  blur: 8,
  dim: 20,
  glass: 65,
  hidden: [],
};

const BUILT_IN_IDS = new Set<string>(BUILT_IN_WALLPAPERS.map((item) => item.id));

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

export function normalizeWallpaperPreferences(value: unknown): WallpaperPreferences {
  const input = value && typeof value === "object" ? value as Partial<WallpaperPreferences> : {};
  const hidden = Array.isArray(input.hidden)
    ? [...new Set(input.hidden.filter((id): id is BuiltInWallpaperId => BUILT_IN_IDS.has(id)))]
    : [];
  const selected = input.selectedId === "custom" || (input.selectedId && BUILT_IN_IDS.has(input.selectedId) && !hidden.includes(input.selectedId as BuiltInWallpaperId))
    ? input.selectedId
    : BUILT_IN_WALLPAPERS.find((item) => !hidden.includes(item.id))?.id ?? "custom";
  return {
    selectedId: selected as WallpaperId,
    blur: clamp(input.blur, WALLPAPER_LIMITS.blur.min, WALLPAPER_LIMITS.blur.max, DEFAULT_WALLPAPER_PREFERENCES.blur),
    dim: clamp(input.dim, WALLPAPER_LIMITS.dim.min, WALLPAPER_LIMITS.dim.max, DEFAULT_WALLPAPER_PREFERENCES.dim),
    glass: snapGlass(clamp(input.glass, WALLPAPER_LIMITS.glass.min, WALLPAPER_LIMITS.glass.max, DEFAULT_WALLPAPER_PREFERENCES.glass)),
    hidden,
  };
}
