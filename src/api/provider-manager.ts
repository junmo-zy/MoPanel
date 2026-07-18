export type ManagedProviderType = "http" | "file" | "inline";

export interface ManagedHealthCheck {
  enable: boolean;
  url: string;
  interval: number;
  lazy: boolean;
}

export interface ManagedProxyProvider {
  name: string;
  type: ManagedProviderType;
  url: string;
  path: string;
  interval: number;
  proxy: string;
  filter: string;
  excludeFilter: string;
  healthCheck: ManagedHealthCheck;
}

export type ManagedProviderInput = ManagedProxyProvider;

export interface ProviderManagerClient {
  list(): Promise<ManagedProxyProvider[]>;
  create(provider: ManagedProviderInput): Promise<ManagedProxyProvider[]>;
  update(originalName: string, provider: ManagedProviderInput): Promise<ManagedProxyProvider[]>;
  remove(name: string): Promise<ManagedProxyProvider[]>;
}

type Fetcher = typeof fetch;

export function createProviderManagerClient(fetcher: Fetcher = fetch): ProviderManagerClient {
  async function request(
    path: string,
    init: RequestInit = {},
  ): Promise<ManagedProxyProvider[]> {
    const response = await fetcher(`/api/config${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    const payload = await response.json().catch(() => ({})) as {
      providers?: ManagedProxyProvider[];
      message?: string;
    };
    if (!response.ok) {
      throw new Error(payload.message || `配置请求失败（${response.status}）`);
    }
    return payload.providers || [];
  }

  return {
    list() {
      return request("/providers");
    },
    create(provider) {
      return request("/providers", {
        method: "POST",
        body: JSON.stringify(provider),
      });
    },
    update(originalName, provider) {
      return request(`/providers/${encodeURIComponent(originalName)}`, {
        method: "PUT",
        body: JSON.stringify(provider),
      });
    },
    remove(name) {
      return request(`/providers/${encodeURIComponent(name)}`, { method: "DELETE" });
    },
  };
}
