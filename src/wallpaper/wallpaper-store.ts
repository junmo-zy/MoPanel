export type WallpaperId = "coastal-mist" | "blue-fjord" | "warm-dunes" | "custom";

export interface WallpaperDefinition {
  id: Exclude<WallpaperId, "custom">;
  name: string;
  url: string;
}

export interface WallpaperPreferences {
  selectedId: WallpaperId;
  blur: number;
  dim: number;
}

export interface WallpaperRepository {
  loadPreferences(): WallpaperPreferences;
  savePreferences(preferences: WallpaperPreferences): void;
  loadCustomWallpaper(): Promise<Blob | null>;
  saveCustomWallpaper(image: Blob): Promise<void>;
  clearCustomWallpaper(): Promise<void>;
}

interface RepositoryOptions {
  storage?: Pick<Storage, "getItem" | "setItem">;
  indexedDB?: IDBFactory;
  databaseName?: string;
}

export const BUILT_IN_WALLPAPERS: WallpaperDefinition[] = [
  { id: "coastal-mist", name: "清晨海雾", url: "/wallpapers/coastal-mist.png" },
  { id: "blue-fjord", name: "蓝色峡湾", url: "/wallpapers/blue-fjord.png" },
  { id: "warm-dunes", name: "暖色沙丘", url: "/wallpapers/warm-dunes.png" },
];

export const DEFAULT_WALLPAPER_PREFERENCES: WallpaperPreferences = {
  selectedId: "coastal-mist",
  blur: 18,
  dim: 18,
};

const PREFERENCES_KEY = "mihomo-mini:wallpaper";
const CUSTOM_WALLPAPER_KEY = "custom";
const VALID_IDS = new Set<WallpaperId>([...BUILT_IN_WALLPAPERS.map((item) => item.id), "custom"]);

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

export function normalizeWallpaperPreferences(value: unknown): WallpaperPreferences {
  const input = value && typeof value === "object" ? value as Partial<WallpaperPreferences> : {};
  return {
    selectedId: input.selectedId && VALID_IDS.has(input.selectedId)
      ? input.selectedId
      : DEFAULT_WALLPAPER_PREFERENCES.selectedId,
    blur: clamp(input.blur, 0, 32, DEFAULT_WALLPAPER_PREFERENCES.blur),
    dim: clamp(input.dim, 0, 60, DEFAULT_WALLPAPER_PREFERENCES.dim),
  };
}

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

export function createWallpaperRepository(options: RepositoryOptions = {}): WallpaperRepository {
  const storage = options.storage || window.localStorage;
  const databaseFactory = options.indexedDB || window.indexedDB;
  const databaseName = options.databaseName || "mihomo-mini-wallpapers";

  return {
    loadPreferences() {
      try {
        const stored = storage.getItem(PREFERENCES_KEY);
        return normalizeWallpaperPreferences(stored ? JSON.parse(stored) : null);
      } catch {
        return DEFAULT_WALLPAPER_PREFERENCES;
      }
    },
    savePreferences(preferences) {
      storage.setItem(PREFERENCES_KEY, JSON.stringify(normalizeWallpaperPreferences(preferences)));
    },
    async loadCustomWallpaper() {
      const result = await accessCustomWallpaper(
        databaseFactory,
        databaseName,
        "readonly",
        (store) => store.get(CUSTOM_WALLPAPER_KEY),
      );
      return result
        && typeof result === "object"
        && typeof (result as Blob).size === "number"
        && typeof (result as Blob).type === "string"
        ? result as Blob
        : null;
    },
    async saveCustomWallpaper(image) {
      await accessCustomWallpaper(
        databaseFactory,
        databaseName,
        "readwrite",
        (store) => store.put(image, CUSTOM_WALLPAPER_KEY),
      );
    },
    async clearCustomWallpaper() {
      await accessCustomWallpaper(
        databaseFactory,
        databaseName,
        "readwrite",
        (store) => store.delete(CUSTOM_WALLPAPER_KEY),
      );
    },
  };
}
