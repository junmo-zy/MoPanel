import { describe, expect, it, vi } from "vitest";
import { createAutoGroupManagerClient } from "./auto-group-manager";

const group = {
  name: "我的优选",
  url: "https://www.gstatic.com/generate_204",
  interval: 300,
  tolerance: 50,
  nodes: [
    { provider: "机场订阅", name: "香港 01" },
    { provider: "机场订阅", name: "日本 02" },
  ],
};

describe("auto group manager client", () => {
  it("uses the open config API for list and CRUD operations", async () => {
    const fetcher = vi.fn(async () => Response.json({ groups: [group] }));
    const client = createAutoGroupManagerClient(fetcher);

    await expect(client.list()).resolves.toEqual([group]);
    await expect(client.create(group)).resolves.toEqual([group]);
    await expect(client.update("旧 分组", group)).resolves.toEqual([group]);
    await expect(client.attach("我的优选")).resolves.toEqual([group]);
    await expect(client.remove("旧 分组")).resolves.toEqual([group]);

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/config/auto-groups", expect.objectContaining({
      headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/config/auto-groups", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/config/auto-groups/%E6%97%A7%20%E5%88%86%E7%BB%84", expect.objectContaining({ method: "PUT" }));
    expect(fetcher).toHaveBeenNthCalledWith(4, "/api/config/auto-groups/%E6%88%91%E7%9A%84%E4%BC%98%E9%80%89/attach", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(5, "/api/config/auto-groups/%E6%97%A7%20%E5%88%86%E7%BB%84", expect.objectContaining({ method: "DELETE" }));
  });

  it("surfaces the config API message", async () => {
    const client = createAutoGroupManagerClient(vi.fn(async () => Response.json({ message: "配置重载失败" }, { status: 400 })));

    await expect(client.create(group)).rejects.toThrow("配置重载失败");
  });
});
