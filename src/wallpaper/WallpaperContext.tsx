import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BUILT_IN_WALLPAPERS,
  DEFAULT_WALLPAPER_PREFERENCES,
  normalizeWallpaperPreferences,
  createWallpaperRepository,
  type WallpaperId,
  type WallpaperPreferences,
  type WallpaperRepository,
} from "./wallpaper-store";
import { WallpaperContext, type WallpaperContextValue } from "./wallpaper-context";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_CUSTOM_SIZE = 16 * 1024 * 1024;

export function WallpaperProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository?: WallpaperRepository;
}) {
  const [activeRepository] = useState(() => repository || createWallpaperRepository());
  const [preferences, setPreferences] = useState(() => activeRepository.loadPreferences());
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const objectUrlRef = useRef<string | null>(null);

  const replaceObjectUrl = useCallback((image: Blob | null) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const nextUrl = image ? URL.createObjectURL(image) : null;
    objectUrlRef.current = nextUrl;
    setCustomUrl(nextUrl);
  }, []);

  useEffect(() => {
    let active = true;
    activeRepository.loadSharedPreferences?.()
      .then((sharedPreferences) => {
        if (active) setPreferences(sharedPreferences);
      })
      .catch(() => {
        // Keep the browser-local wallpaper as an offline fallback.
      });
    return () => { active = false; };
  }, [activeRepository]);

  useEffect(() => {
    let active = true;
    activeRepository.loadCustomWallpaper()
      .then((image) => {
        if (active && image) replaceObjectUrl(image);
      })
      .catch(() => {
        if (active) setError("无法读取自定义壁纸，可以重新上传。");
      });
    return () => {
      active = false;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [activeRepository, replaceObjectUrl]);

  // Sliders change values many times per second; save once they settle.
  const pendingSave = useRef<WallpaperPreferences | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const flushSave = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const next = pendingSave.current;
    pendingSave.current = null;
    if (!next) return;
    void Promise.resolve(activeRepository.savePreferences(next)).catch(() => {
      if (next.selectedId === "custom") return;
      setError("无法同步壁纸设置，已保留在当前浏览器。");
    });
  }, [activeRepository]);

  useEffect(() => () => flushSave(), [flushSave]);

  const updatePreferences = useCallback((update: (current: WallpaperPreferences) => WallpaperPreferences) => {
    setPreferences((current) => normalizeWallpaperPreferences(update(current)));
  }, []);

  const userChange = useRef(false);
  const lastSaved = useRef(preferences);
  useEffect(() => {
    if (lastSaved.current === preferences) return;
    lastSaved.current = preferences;
    if (!userChange.current) return;
    userChange.current = false;
    pendingSave.current = preferences;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSave, 350);
  }, [preferences, flushSave]);
  const change = useCallback((update: (current: WallpaperPreferences) => WallpaperPreferences) => {
    userChange.current = true;
    updatePreferences(update);
  }, [updatePreferences]);

  const chooseWallpaper = useCallback((selectedId: WallpaperId) => {
    if (selectedId === "custom" && !customUrl) {
      setError("请先上传一张自定义壁纸。");
      return;
    }
    setError("");
    change((current) => ({ ...current, selectedId }));
  }, [customUrl, change]);

  const uploadWallpaper = useCallback(async (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError("请选择 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (file.size > MAX_CUSTOM_SIZE) {
      setError("壁纸不能超过 16 MB。");
      return;
    }
    try {
      await activeRepository.saveCustomWallpaper(file);
    } catch {
      setError("无法保存共享壁纸，可以稍后重试。");
      return;
    }
    replaceObjectUrl(file);
    setError("");
    change((current) => ({ ...current, selectedId: "custom" }));
  }, [activeRepository, replaceObjectUrl, change]);

  const removeCustomWallpaper = useCallback(async () => {
    try {
      await activeRepository.clearCustomWallpaper();
    } catch {
      setError("无法移除共享壁纸，可以稍后重试。");
      return;
    }
    replaceObjectUrl(null);
    setError("");
    // normalizeWallpaperPreferences moves the selection to a visible preset.
    change((current) => ({ ...current, selectedId: current.selectedId === "custom" ? "coastal-mist" : current.selectedId }));
  }, [activeRepository, replaceObjectUrl, change]);

  const visibleBuiltIns = BUILT_IN_WALLPAPERS.filter((item) => !preferences.hidden.includes(item.id));
  // null = no wallpaper left: the shell falls back to a plain gradient.
  const wallpaperUrl = preferences.selectedId === "custom" && customUrl
    ? customUrl
    : visibleBuiltIns.find((item) => item.id === preferences.selectedId)?.url
      || visibleBuiltIns[0]?.url
      || null;

  const value = useMemo<WallpaperContextValue>(() => ({
    ...preferences,
    wallpaperUrl,
    customUrl,
    error,
    chooseWallpaper,
    setBlur: (blur) => change((current) => ({ ...current, blur })),
    setDim: (dim) => change((current) => ({ ...current, dim })),
    setGlass: (glass) => change((current) => ({ ...current, glass })),
    hideWallpaper: (id) => change((current) => {
      const hidden = [...new Set([...current.hidden, id])];
      // Keep at least one wallpaper unless a custom image exists.
      if (!customUrl && hidden.length >= BUILT_IN_WALLPAPERS.length) return current;
      const selectedId = current.selectedId === id
        ? BUILT_IN_WALLPAPERS.find((item) => !hidden.includes(item.id))?.id ?? "custom"
        : current.selectedId;
      return { ...current, hidden, selectedId };
    }),
    restoreWallpapers: () => change((current) => ({ ...current, hidden: [] })),
    resetAppearance: () => change((current) => ({ ...DEFAULT_WALLPAPER_PREFERENCES, selectedId: current.selectedId, hidden: current.hidden })),
    uploadWallpaper,
    removeCustomWallpaper,
  }), [preferences, wallpaperUrl, customUrl, error, chooseWallpaper, change, uploadWallpaper, removeCustomWallpaper]);

  return <WallpaperContext.Provider value={value}>{children}</WallpaperContext.Provider>;
}
