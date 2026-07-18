export const DEFAULT_SPEED_TEST_URL = "https://www.gstatic.com/generate_204";

const SPEED_TEST_URL_KEY = "mihomo-mini:speed-test-url";

function validSpeedTestUrl(value: string) {
  const parsed = new URL(value);
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

export function loadSpeedTestUrl() {
  try {
    const saved = localStorage.getItem(SPEED_TEST_URL_KEY)?.trim();
    return saved && validSpeedTestUrl(saved) ? saved : DEFAULT_SPEED_TEST_URL;
  } catch {
    return DEFAULT_SPEED_TEST_URL;
  }
}

export function saveSpeedTestUrl(value: string) {
  const normalized = value.trim();
  if (!normalized || !validSpeedTestUrl(normalized)) {
    throw new Error("测速地址必须是有效的 HTTP 或 HTTPS 地址");
  }
  localStorage.setItem(SPEED_TEST_URL_KEY, normalized);
  return normalized;
}
