export interface AutoGroupNodeRef {
  provider: string;
  name: string;
}

export interface ManagedAutoGroup {
  name: string;
  url: string;
  interval: number;
  tolerance: number;
  nodes: AutoGroupNodeRef[];
}

export type ManagedAutoGroupInput = ManagedAutoGroup;

export interface AutoGroupManagerClient {
  list(): Promise<ManagedAutoGroup[]>;
  create(group: ManagedAutoGroupInput): Promise<ManagedAutoGroup[]>;
  update(originalName: string, group: ManagedAutoGroupInput): Promise<ManagedAutoGroup[]>;
  attach(name: string): Promise<ManagedAutoGroup[]>;
  remove(name: string): Promise<ManagedAutoGroup[]>;
}

type Fetcher = typeof fetch;

export function createAutoGroupManagerClient(fetcher: Fetcher = fetch): AutoGroupManagerClient {
  async function request(path: string, init: RequestInit = {}): Promise<ManagedAutoGroup[]> {
    const response = await fetcher(`/api/config${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const payload = await response.json().catch(() => ({})) as {
      groups?: ManagedAutoGroup[];
      message?: string;
    };
    if (!response.ok) {
      throw new Error(payload.message || `配置请求失败（${response.status}）`);
    }
    return payload.groups || [];
  }

  return {
    list() {
      return request("/auto-groups");
    },
    create(group) {
      return request("/auto-groups", { method: "POST", body: JSON.stringify(group) });
    },
    update(originalName, group) {
      return request(`/auto-groups/${encodeURIComponent(originalName)}`, {
        method: "PUT",
        body: JSON.stringify(group),
      });
    },
    attach(name) {
      return request(`/auto-groups/${encodeURIComponent(name)}/attach`, { method: "POST" });
    },
    remove(name) {
      return request(`/auto-groups/${encodeURIComponent(name)}`, { method: "DELETE" });
    },
  };
}
