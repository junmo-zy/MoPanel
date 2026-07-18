export interface PanelSettings {
  speedTestUrl: string;
}

export interface PanelSettingsClient {
  get(): Promise<PanelSettings>;
  save(speedTestUrl: string): Promise<PanelSettings>;
}

type Fetcher = typeof fetch;

export function createPanelSettingsClient(fetcher: Fetcher = fetch): PanelSettingsClient {
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetcher(`/api/config${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });
    const payload = await response.json().catch(() => ({})) as Partial<PanelSettings> & { message?: string };
    if (!response.ok) throw new Error(payload.message || `测速设置请求失败（${response.status}）`);
    if (typeof payload.speedTestUrl !== "string") throw new Error("测速设置响应无效");
    return { speedTestUrl: payload.speedTestUrl };
  }

  return {
    get() {
      return request("/settings");
    },
    save(speedTestUrl) {
      return request("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speedTestUrl }),
      });
    },
  };
}
