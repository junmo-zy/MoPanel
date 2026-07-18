import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BUILT_IN_WALLPAPERS,
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

  const updatePreferences = useCallback((update: (current: WallpaperPreferences) => WallpaperPreferences) => {
    setPreferences((current) => {
      const next = update(current);
      activeRepository.savePreferences(next);
      return next;
    });
  }, [activeRepository]);

  const chooseWallpaper = useCallback((selectedId: WallpaperId) => {
    if (selectedId === "custom" && !customUrl) {
      setError("请先上传一张自定义壁纸。");
      return;
    }
    setError("");
    updatePreferences((current) => ({ ...current, selectedId }));
  }, [customUrl, updatePreferences]);

  const uploadWallpaper = useCallback(async (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError("请选择 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (file.size > MAX_CUSTOM_SIZE) {
      setError("壁纸不能超过 16 MB。");
      return;
    }
    await activeRepository.saveCustomWallpaper(file);
    replaceObjectUrl(file);
    setError("");
    updatePreferences((current) => ({ ...current, selectedId: "custom" }));
  }, [activeRepository, replaceObjectUrl, updatePreferences]);

  const removeCustomWallpaper = useCallback(async () => {
    await activeRepository.clearCustomWallpaper();
    replaceObjectUrl(null);
    setError("");
    updatePreferences((current) => ({ ...current, selectedId: "coastal-mist" }));
  }, [activeRepository, replaceObjectUrl, updatePreferences]);

  const wallpaperUrl = preferences.selectedId === "custom" && customUrl
    ? customUrl
    : BUILT_IN_WALLPAPERS.find((item) => item.id === preferences.selectedId)?.url
      || BUILT_IN_WALLPAPERS[0].url;

  const value = useMemo<WallpaperContextValue>(() => ({
    ...preferences,
    wallpaperUrl,
    customUrl,
    error,
    chooseWallpaper,
    changeBlur: (amount) => updatePreferences((current) => ({
      ...current,
      blur: Math.max(0, Math.min(32, current.blur + amount)),
    })),
    changeDim: (amount) => updatePreferences((current) => ({
      ...current,
      dim: Math.max(0, Math.min(60, current.dim + amount)),
    })),
    uploadWallpaper,
    removeCustomWallpaper,
  }), [preferences, wallpaperUrl, customUrl, error, chooseWallpaper, updatePreferences, uploadWallpaper, removeCustomWallpaper]);

  return <WallpaperContext.Provider value={value}>{children}</WallpaperContext.Provider>;
}
