import { createContext } from "react";
import type { BuiltInWallpaperId, WallpaperId, WallpaperPreferences } from "./wallpaper-preferences";

export interface WallpaperContextValue extends WallpaperPreferences {
  wallpaperUrl: string | null;
  customUrl: string | null;
  error: string;
  chooseWallpaper: (id: WallpaperId) => void;
  setBlur: (blur: number) => void;
  setDim: (dim: number) => void;
  setGlass: (glass: number) => void;
  hideWallpaper: (id: BuiltInWallpaperId) => void;
  restoreWallpapers: () => void;
  resetAppearance: () => void;
  uploadWallpaper: (file: File) => Promise<void>;
  removeCustomWallpaper: () => Promise<void>;
}

export const WallpaperContext = createContext<WallpaperContextValue | null>(null);
