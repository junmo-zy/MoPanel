import { useContext } from "react";
import { WallpaperContext } from "./wallpaper-context";

export function useWallpaper() {
  const value = useContext(WallpaperContext);
  if (!value) throw new Error("useWallpaper must be used inside WallpaperProvider");
  return value;
}
