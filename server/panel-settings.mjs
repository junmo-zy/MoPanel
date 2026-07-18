import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const DEFAULT_SPEED_TEST_URL = "https://www.gstatic.com/generate_204";

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

export class PanelSettingsStore {
  #settingsPath;
  #queue = Promise.resolve();

  constructor(configPath) {
    this.#settingsPath = join(dirname(configPath), ".mihomo-mini", "settings.json");
  }

  async get() {
    try {
      const source = await readFile(this.#settingsPath, "utf8");
      const parsed = JSON.parse(source);
      return { speedTestUrl: normalizeSpeedTestUrl(parsed?.speedTestUrl) };
    } catch (error) {
      if (error?.code === "ENOENT") return { speedTestUrl: DEFAULT_SPEED_TEST_URL };
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
    const next = { speedTestUrl: normalizeSpeedTestUrl(settings?.speedTestUrl) };
    await mkdir(dirname(this.#settingsPath), { recursive: true });
    const temporaryPath = `${this.#settingsPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.#settingsPath);
    return next;
  }
}
