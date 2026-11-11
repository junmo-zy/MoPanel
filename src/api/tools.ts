export type UnlockStatus = "yes" | "no" | "originals" | "failed";

export interface UnlockService {
  id: string;
  name: string;
}

export interface UnlockResult {
  id: string;
  status: UnlockStatus;
  region?: string;
  detail?: string;
  checkedAt: string;
}

export interface ExitIpInfo {
  ip: string;
  countryCode?: string;
  country?: string;
  region?: string;
  city?: string;
  isp?: string;
  asn?: string;
  org?: string;
  timezone?: string;
  source?: string;
}

export interface ToolsClient {
  listUnlockServices(): Promise<UnlockService[]>;
  runUnlock(id: string): Promise<UnlockResult>;
  latency(url: string): Promise<number>;
  exitIp(): Promise<ExitIpInfo>;
}

// Errors carry the server's explanation (e.g. the proxy port is unreachable).
export class ToolsError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "ToolsError";
  }
}

type Fetcher = typeof fetch;

export function createToolsClient(fetcher: Fetcher = fetch): ToolsClient {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`/api/tools${path}`, {
        ...init,
        headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      });
    } catch {
      throw new ToolsError("无法连接 MoPanel 服务");
    }
    const payload = await response.json().catch(() => ({})) as T & { message?: string; code?: string };
    if (!response.ok) throw new ToolsError(payload.message || `检测失败（${response.status}）`, payload.code);
    return payload;
  }

  return {
    async listUnlockServices() {
      return (await request<{ services: UnlockService[] }>("/unlock")).services;
    },
    runUnlock(id) {
      return request<UnlockResult>(`/unlock/${encodeURIComponent(id)}`, { method: "POST" });
    },
    async latency(url) {
      return (await request<{ delay: number }>("/latency", { method: "POST", body: JSON.stringify({ url }) })).delay;
    },
    exitIp() {
      return request<ExitIpInfo>("/ip");
    },
  };
}

const ALPHA3: Record<string, string> = {
  HKG: "HK", JPN: "JP", SGP: "SG", USA: "US", TWN: "TW", KOR: "KR", GBR: "GB", DEU: "DE", FRA: "FR",
  CAN: "CA", AUS: "AU", NLD: "NL", IND: "IN", MAC: "MO", CHN: "CN", RUS: "RU", THA: "TH", MYS: "MY",
  VNM: "VN", PHL: "PH", IDN: "ID", TUR: "TR", BRA: "BR", ARG: "AR", MEX: "MX", ITA: "IT", ESP: "ES",
};

let flagSupport: boolean | null = null;

// Windows (and browsers without an emoji font) draw flag emoji as two
// letters; detect that once so the region code is not shown twice.
function supportsFlagEmoji() {
  if (flagSupport !== null) return flagSupport;
  try {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return (flagSupport = false);
    context.font = "16px sans-serif";
    const flag = context.measureText("\u{1F1EF}\u{1F1F5}").width;
    const letter = context.measureText("\u{1F1EF}").width;
    flagSupport = flag > 0 && flag < letter * 1.5;
  } catch {
    flagSupport = false;
  }
  return flagSupport;
}

// 🇭🇰 for "HK" / "HKG"; nothing for codes like "ALISG" or without flag support.
export function regionFlag(region?: string, detect = supportsFlagEmoji) {
  if (!region || !detect()) return "";
  const code = region.length === 3 ? ALPHA3[region.toUpperCase()] : region.toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}
