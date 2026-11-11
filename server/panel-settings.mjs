import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const DEFAULT_SPEED_TEST_URL = "https://www.gstatic.com/generate_204";
export const DEFAULT_WALLPAPER_PREFERENCES = {
  selectedId: "coastal-mist",
  blur: 8,
  dim: 20,
  glass: 65,
  hidden: [],
};

const BUILT_IN_WALLPAPER_IDS = ["coastal-mist", "blue-fjord", "warm-dunes"];

const VALID_WALLPAPER_IDS = new Set(["coastal-mist", "blue-fjord", "warm-dunes", "custom"]);
const CUSTOM_WALLPAPER_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const MAX_CUSTOM_WALLPAPER_SIZE = 16 * 1024 * 1024;

export class PanelSettingsError extends Error {
  constructor(message) {
    super(message);
    this.name = "PanelSettingsError";
  }
}

function validSpeedTestUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeSpeedTestUrl(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || !validSpeedTestUrl(normalized)) {
    throw new PanelSettingsError("测速地址必须是有效的 HTTP 或 HTTPS 地址");
  }
  return normalized;
}

function normalizeSelectedProviders(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new PanelSettingsError("订阅选择必须是唯一的非空名称列表");
  }
  const names = value.map((name) => typeof name === "string" ? name.trim() : "");
  if (names.some((name) => !name) || new Set(names).size !== names.length) {
    throw new PanelSettingsError("订阅选择必须是唯一的非空名称列表");
  }
  return names;
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

// Material levels: 超薄 / 轻薄 / 标准 / 浓厚 (see GLASS_LEVELS on the client).
const GLASS_LEVELS = [25, 45, 65, 85];

function snapGlass(value) {
  return GLASS_LEVELS.reduce((best, level) => (Math.abs(level - value) < Math.abs(best - value) ? level : best), 65);
}

// Mirrors src/wallpaper/wallpaper-preferences.ts.
function normalizeWallpaperPreferences(value) {
  const input = value && typeof value === "object" ? value : {};
  const hidden = Array.isArray(input.hidden)
    ? [...new Set(input.hidden.filter((id) => BUILT_IN_WALLPAPER_IDS.includes(id)))]
    : [];
  const selectedId = VALID_WALLPAPER_IDS.has(input.selectedId) && !hidden.includes(input.selectedId)
    ? input.selectedId
    : BUILT_IN_WALLPAPER_IDS.find((id) => !hidden.includes(id)) ?? "custom";
  return {
    selectedId,
    blur: clamp(input.blur, 0, 60, DEFAULT_WALLPAPER_PREFERENCES.blur),
    dim: clamp(input.dim, 0, 90, DEFAULT_WALLPAPER_PREFERENCES.dim),
    glass: snapGlass(clamp(input.glass, 10, 95, DEFAULT_WALLPAPER_PREFERENCES.glass)),
    hidden,
  };
}

function normalizeSettings(settings) {
  return {
    speedTestUrl: normalizeSpeedTestUrl(settings?.speedTestUrl),
    selectedProviders: normalizeSelectedProviders(settings?.selectedProviders),
    wallpaper: normalizeWallpaperPreferences(settings?.wallpaper),
  };
}

export class PanelSettingsStore {
  #settingsPath;
  #wallpaperDirectory;
  #queue = Promise.resolve();

  constructor(configPath) {
    const metadataDirectory = join(dirname(configPath), ".mihomo-mini");
    this.#settingsPath = join(metadataDirectory, "settings.json");
    this.#wallpaperDirectory = join(metadataDirectory, "wallpapers");
  }

  async get() {
    try {
      const source = await readFile(this.#settingsPath, "utf8");
      const parsed = JSON.parse(source);
      return normalizeSettings(parsed);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          speedTestUrl: DEFAULT_SPEED_TEST_URL,
          selectedProviders: null,
          wallpaper: DEFAULT_WALLPAPER_PREFERENCES,
        };
      }
      if (error instanceof PanelSettingsError) throw error;
      throw new PanelSettingsError("测速设置文件无效，请重新保存测速地址");
    }
  }

  save(settings) {
    const task = this.#queue.then(() => this.#save(settings));
    this.#queue = task.catch(() => undefined);
    return task;
  }

  async #save(settings) {
    const current = await this.get();
    const next = {
      speedTestUrl: Object.hasOwn(settings ?? {}, "speedTestUrl")
        ? normalizeSpeedTestUrl(settings.speedTestUrl)
        : current.speedTestUrl,
      selectedProviders: Object.hasOwn(settings ?? {}, "selectedProviders")
        ? normalizeSelectedProviders(settings.selectedProviders)
        : current.selectedProviders,
      wallpaper: Object.hasOwn(settings ?? {}, "wallpaper")
        ? normalizeWallpaperPreferences(settings.wallpaper)
        : current.wallpaper,
    };
    await mkdir(dirname(this.#settingsPath), { recursive: true });
    const temporaryPath = `${this.#settingsPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.#settingsPath);
    return next;
  }

  async loadCustomWallpaper() {
    for (const [contentType, extension] of CUSTOM_WALLPAPER_TYPES) {
      try {
        const data = await readFile(join(this.#wallpaperDirectory, `custom.${extension}`));
        return { contentType, data };
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    return null;
  }

  async saveCustomWallpaper({ contentType, data }) {
    const extension = CUSTOM_WALLPAPER_TYPES.get(contentType);
    if (!extension) throw new PanelSettingsError("壁纸必须是 JPG、PNG 或 WebP 图片");
    if (!Buffer.isBuffer(data) || data.length === 0) throw new PanelSettingsError("壁纸文件不能为空");
    if (data.length > MAX_CUSTOM_WALLPAPER_SIZE) throw new PanelSettingsError("壁纸不能超过 16 MB");

    await mkdir(this.#wallpaperDirectory, { recursive: true });
    await this.clearCustomWallpaper();
    const targetPath = join(this.#wallpaperDirectory, `custom.${extension}`);
    const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, data);
    await rename(temporaryPath, targetPath);
  }

  async clearCustomWallpaper() {
    await Promise.all([...CUSTOM_WALLPAPER_TYPES.values()].map((extension) => (
      rm(join(this.#wallpaperDirectory, `custom.${extension}`), { force: true })
    )));
  }
}
