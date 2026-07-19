export interface ActiveProviderState {
  providers: string[];
  activeProvider: string | null;
}

export interface ActiveProviderClient {
  get(): Promise<ActiveProviderState>;
  select(name: string): Promise<ActiveProviderState>;
}

type Fetcher = typeof fetch;

export function createActiveProviderClient(fetcher: Fetcher = fetch): ActiveProviderClient {
  async function request(init: RequestInit = {}): Promise<ActiveProviderState> {
    const response = await fetcher("/api/config/active-provider", {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const payload = await response.json().catch(() => ({})) as Partial<ActiveProviderState> & { message?: string };
    if (!response.ok) throw new Error(payload.message || `订阅切换失败（${response.status}）`);
    return {
      providers: Array.isArray(payload.providers) ? payload.providers : [],
      activeProvider: typeof payload.activeProvider === "string" ? payload.activeProvider : null,
    };
  }

  return {
    get() {
      return request();
    },
    select(name) {
      return request({ method: "PUT", body: JSON.stringify({ name }) });
    },
  };
}
