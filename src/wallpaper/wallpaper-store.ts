import { createPanelSettingsClient, type PanelSettingsClient } from "../api/panel-settings";
import {
  BUILT_IN_WALLPAPERS,
  DEFAULT_WALLPAPER_PREFERENCES,
  normalizeWallpaperPreferences,
  type WallpaperPreferences,
} from "./wallpaper-preferences";

export interface WallpaperRepository {
  loadPreferences(): WallpaperPreferences;
  loadSharedPreferences?(): Promise<WallpaperPreferences>;
  savePreferences(preferences: WallpaperPreferences): void | Promise<void>;
  loadCustomWallpaper(): Promise<Blob | null>;
  saveCustomWallpaper(image: Blob): Promise<void>;
  clearCustomWallpaper(): Promise<void>;
}

interface RepositoryOptions {
  storage?: Pick<Storage, "getItem" | "setItem">;
  indexedDB?: IDBFactory;
  databaseName?: string;
  settingsClient?: PanelSettingsClient | null;
  fetcher?: typeof fetch;
  customWallpaperPath?: string;
}

export {
  BUILT_IN_WALLPAPERS,
  DEFAULT_WALLPAPER_PREFERENCES,
  normalizeWallpaperPreferences,
};
export type { BuiltInWallpaperId, WallpaperDefinition, WallpaperId, WallpaperPreferences } from "./wallpaper-preferences";

const PREFERENCES_KEY = "mihomo-mini:wallpaper";
const CUSTOM_WALLPAPER_KEY = "custom";
const DEFAULT_CUSTOM_WALLPAPER_PATH = "/api/config/wallpaper/custom";

function openDatabase(factory: IDBFactory, databaseName: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("wallpapers")) {
        request.result.createObjectStore("wallpapers");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开壁纸存储"));
  });
}

async function accessCustomWallpaper<T>(
  factory: IDBFactory,
  databaseName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase(factory, databaseName);
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("wallpapers", mode);
      const request = action(transaction.objectStore("wallpapers"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("壁纸存储操作失败"));
      transaction.onabort = () => reject(transaction.error || new Error("壁纸存储操作已中止"));
    });
  } finally {
    database.close();
  }
}

function isStoredBlob(result: unknown): result is Blob {
  return Boolean(
    result
    && typeof result === "object"
    && typeof (result as Blob).size === "number"
    && typeof (result as Blob).type === "string",
  );
}

export function createWallpaperRepository(options: RepositoryOptions = {}): WallpaperRepository {
  const storage = options.storage || window.localStorage;
  const databaseFactory = options.indexedDB || window.indexedDB;
  const databaseName = options.databaseName || "mihomo-mini-wallpapers";
  const settingsClient = options.settingsClient === undefined
    ? createPanelSettingsClient(options.fetcher)
    : options.settingsClient;
  const fetcher = options.fetcher || fetch;
  const customWallpaperPath = options.customWallpaperPath || DEFAULT_CUSTOM_WALLPAPER_PATH;
  const useSharedCustomWallpaper = options.settingsClient !== null || Boolean(options.fetcher);

  const loadLocalCustomWallpaper = async () => {
    const result = await accessCustomWallpaper(
      databaseFactory,
      databaseName,
      "readonly",
      (store) => store.get(CUSTOM_WALLPAPER_KEY),
    );
    return isStoredBlob(result) ? result : null;
  };

  const saveLocalCustomWallpaper = (image: Blob) => accessCustomWallpaper(
    databaseFactory,
    databaseName,
    "readwrite",
    (store) => store.put(image, CUSTOM_WALLPAPER_KEY),
  );

  const clearLocalCustomWallpaper = () => accessCustomWallpaper(
    databaseFactory,
    databaseName,
    "readwrite",
    (store) => store.delete(CUSTOM_WALLPAPER_KEY),
  );

  return {
    loadPreferences() {
      try {
        const stored = storage.getItem(PREFERENCES_KEY);
        return normalizeWallpaperPreferences(stored ? JSON.parse(stored) : null);
      } catch {
        return DEFAULT_WALLPAPER_PREFERENCES;
      }
    },
    ...(settingsClient ? {
      async loadSharedPreferences() {
        const settings = await settingsClient.get();
        const preferences = normalizeWallpaperPreferences(settings.wallpaper);
        storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
        return preferences;
      },
    } : {}),
    savePreferences(preferences) {
      const normalized = normalizeWallpaperPreferences(preferences);
      storage.setItem(PREFERENCES_KEY, JSON.stringify(normalized));
      if (!settingsClient) return;
      return settingsClient.save({ wallpaper: normalized }).then(() => undefined).catch(() => undefined);
    },
    async loadCustomWallpaper() {
      if (useSharedCustomWallpaper) {
        try {
          const response = await fetcher(customWallpaperPath, { headers: { Accept: "image/*" } });
          if (response.status === 404) return null;
          if (!response.ok) throw new Error("无法读取共享壁纸");
          return await response.blob();
        } catch {
          return loadLocalCustomWallpaper();
        }
      }
      return loadLocalCustomWallpaper();
    },
    async saveCustomWallpaper(image) {
      if (useSharedCustomWallpaper) {
        try {
          const response = await fetcher(customWallpaperPath, {
            method: "PUT",
            headers: { "Content-Type": image.type },
            body: image,
          });
          if (!response.ok) throw new Error("无法保存共享壁纸");
        } catch (error) {
          if (error instanceof TypeError) {
            await saveLocalCustomWallpaper(image);
            return;
          }
          throw error;
        }
      }
      await saveLocalCustomWallpaper(image);
    },
    async clearCustomWallpaper() {
      if (useSharedCustomWallpaper) {
        try {
          const response = await fetcher(customWallpaperPath, { method: "DELETE" });
          if (!response.ok && response.status !== 404) throw new Error("无法移除共享壁纸");
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
        }
      }
      await clearLocalCustomWallpaper();
    },
  };
}
