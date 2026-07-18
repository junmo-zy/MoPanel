import { createContext } from "react";
import type { WallpaperId, WallpaperPreferences } from "./wallpaper-store";

export interface WallpaperContextValue extends WallpaperPreferences {
  wallpaperUrl: string;
  customUrl: string | null;
  error: string;
  chooseWallpaper: (id: WallpaperId) => void;
  changeBlur: (amount: number) => void;
  changeDim: (amount: number) => void;
  uploadWallpaper: (file: File) => Promise<void>;
  removeCustomWallpaper: () => Promise<void>;
}

export const WallpaperContext = createContext<WallpaperContextValue | null>(null);
