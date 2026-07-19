import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { AutoGroupManagerClient, ManagedAutoGroup } from "./api/auto-group-manager";
import type { ActiveProviderClient } from "./api/active-provider";
import type { ProviderManagerClient } from "./api/provider-manager";
import type { MihomoClient, OverviewData } from "./api/types";

const overview: OverviewData = {
  connected: true,
  version: "v-test",
  mode: "rule",
  mixedPort: 7890,
  allowLan: false,
  downloadTotal: 2048,
  uploadTotal: 1024,
  connectionCount: 2,
  tcpCount: 1,
  udpCount: 1,
  groups: [
    {
      name: "PROXY",
      type: "Selector",
      current: "自动选择",
      delay: 28,
      nodes: [
        { name: "自动选择", type: "Selector", delay: 28, alive: true },
        { name: "备用策略", type: "Selector", delay: 61, alive: true },
      ],
    },
    {
      name: "自动选择",
      type: "Selector",
      current: "测试节点",
      delay: 28,
      nodes: [
        { name: "测试节点", type: "VLESS", delay: 28, alive: true },
        { name: "备用节点", type: "Hysteria2", delay: 61, alive: true },
      ],
    },
  ],
  providers: [{ name: "测试订阅", vehicleType: "HTTP", updatedAt: null, proxyCount: 2 }],
  providerNodes: [
    { provider: "测试订阅", name: "测试节点", type: "VLESS", delay: 28, alive: true },
    { provider: "测试订阅", name: "备用节点", type: "Hysteria2", delay: 61, alive: true },
  ],
};

function createFakeClient(): MihomoClient {
  return {
    getOverview: vi.fn(async () => overview),
    setMode: vi.fn(async () => undefined),
    selectProxy: vi.fn(async () => undefined),
    testProxy: vi.fn(async () => 33),
    testGroup: vi.fn(async () => ({ "测试节点": 33, "备用节点": 61 })),
    updateProvider: vi.fn(async () => undefined),
    getConnections: vi.fn(async () => ({ downloadTotal: 0, uploadTotal: 0, connections: [] })),
    closeConnection: vi.fn(async () => undefined),
    closeAllConnections: vi.fn(async () => undefined),
    updateConfig: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("Control panel shell", () => {
  it("shows the selected overview layout and primary controls", () => {
    const { container } = render(<App />);

    expect(screen.getByRole("heading", { name: "代理服务运行正常" })).toBeInTheDocument();
    expect(container.querySelector(".product-brand")).toHaveTextContent("MoPanel");
    expect(container.querySelector(".product-brand img")).toHaveAttribute("src", "/brand/mopanel-cat.png");
    expect(container.querySelector(".product-brand img")).toHaveAttribute("alt", "");
    expect(screen.getByRole("button", { name: "规则" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "更换代理" })).toBeInTheDocument();
    expect(screen.getByText("自动选择")).toBeInTheDocument();
  });

  it("changes the active proxy mode from the overview", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "全局" }));

    expect(screen.getByRole("button", { name: "全局" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "规则" })).toHaveAttribute("aria-pressed", "false");
  });

  it("loads live overview data and persists a mode change through the client", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    client.getOverview = vi.fn()
      .mockResolvedValueOnce(overview)
      .mockResolvedValueOnce({ ...overview, mode: "global" });
    const TestApp = App as React.ComponentType<{ client: MihomoClient }>;

    render(<TestApp client={client} />);

    expect((await screen.findAllByText(/测试节点/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "规则" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "全局" }));

    expect(client.setMode).toHaveBeenCalledWith("global");
    await waitFor(() => expect(screen.getByRole("button", { name: "全局" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("refreshes the effective proxy periodically so automatic groups stay current", async () => {
    vi.useFakeTimers();
    const client = createFakeClient();
    const refreshedOverview: OverviewData = {
      ...overview,
      groups: [
        { ...overview.groups[0], current: "polled-auto" },
        ...overview.groups.slice(1),
        { name: "polled-auto", type: "URLTest", current: "node-latest", delay: 42, nodes: [] },
      ],
    };
    client.getOverview = vi.fn()
      .mockResolvedValueOnce(overview)
      .mockResolvedValueOnce(refreshedOverview);
    const TestApp = App as React.ComponentType<{ client: MihomoClient }>;
    const { container } = render(<TestApp client={client} />);

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });

    expect(client.getOverview).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".current-proxy strong")).toHaveTextContent("polled-auto · node-latest");
  });

  it("retries after an initial controller failure and replaces demo data when it recovers", async () => {
    vi.useFakeTimers();
    const client = createFakeClient();
    client.getOverview = vi.fn()
      .mockRejectedValueOnce(new Error("controller is starting"))
      .mockResolvedValueOnce(overview);
    const TestApp = App as React.ComponentType<{ client: MihomoClient }>;
    const { container } = render(<TestApp client={client} />);

    await act(async () => { await Promise.resolve(); });
    expect(client.getOverview).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });

    expect(client.getOverview).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".window-status")).toHaveTextContent("已连接");
    expect(container.querySelector(".demo-badge")).not.toBeInTheDocument();
  });

  it("shows a disconnected titlebar state when the proxy service reports no controller connection", async () => {
    const client = createFakeClient();
    client.getOverview = vi.fn(async () => ({ ...overview, connected: false }));
    const TestApp = App as React.ComponentType<{ client: MihomoClient }>;

    render(<TestApp client={client} />);

    await screen.findByRole("heading", { name: "代理服务未连接" });
    expect(screen.getByText("未连接", { selector: ".window-status" })).toBeInTheDocument();
  });

  it("switches the active proxy group from the overview dialog", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    const TestApp = App as React.ComponentType<{ client: MihomoClient }>;
    render(<TestApp client={client} />);
    await screen.findAllByText(/测试节点/);

    await user.click(screen.getByRole("button", { name: "更换代理" }));
    expect(screen.getByRole("dialog", { name: "选择节点" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^备用策略 61 ms$/ }));

    expect(client.selectProxy).toHaveBeenCalledWith("PROXY", "备用策略");
    expect(screen.queryByRole("dialog", { name: "切换节点" })).not.toBeInTheDocument();
  });

  it("saves the testing URL in settings and uses it for the primary group", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    const panelSettingsClient = {
      get: vi.fn(async () => ({ speedTestUrl: "https://www.gstatic.com/generate_204", selectedProviders: null })),
      save: vi.fn(async (settings: { speedTestUrl: string; selectedProviders: string[] | null }) => settings),
    };
    render(<App client={client} panelSettingsClient={panelSettingsClient} />);

    await user.click(screen.getByRole("button", { name: "设置" }));
    const testUrl = screen.getByLabelText("测速地址");
    await user.clear(testUrl);
    await user.type(testUrl, "https://cp.cloudflare.com");
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    await user.click(screen.getByRole("button", { name: "概览" }));
    await user.click(screen.getByRole("button", { name: "测速" }));

    expect(client.testGroup).toHaveBeenCalledWith("自动选择", "https://cp.cloudflare.com");
    expect(localStorage.getItem("mihomo-mini:speed-test-url")).toBe("https://cp.cloudflare.com");
  }, 10_000);

  it("loads the shared testing URL from the panel settings API", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    const panelSettingsClient = {
      get: vi.fn(async () => ({ speedTestUrl: "https://cp.cloudflare.com/generate_204", selectedProviders: null })),
      save: vi.fn(async (settings: { speedTestUrl: string; selectedProviders: string[] | null }) => settings),
    };

    render(<App client={client} {...{ panelSettingsClient }} />);

    await waitFor(() => expect(panelSettingsClient.get).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "设置" }));
    await screen.findByDisplayValue("https://cp.cloudflare.com/generate_204");
  });

  it("switches one configured subscription and refreshes proxy nodes from Mihomo", async () => {
    const user = userEvent.setup();
    const selectedOverview: OverviewData = {
      ...overview,
      providers: [
        { name: "订阅 A", vehicleType: "HTTP", updatedAt: null, proxyCount: 1 },
        { name: "订阅 B", vehicleType: "HTTP", updatedAt: null, proxyCount: 1 },
        { name: "PROXY", vehicleType: "Compatible", updatedAt: null, proxyCount: 2 },
      ],
      providerNodes: [
        { provider: "订阅 A", name: "节点 A", type: "VLESS", delay: 35, alive: true },
        { provider: "订阅 B", name: "节点 B", type: "Trojan", delay: 72, alive: true },
      ],
      groups: [{
        name: "PROXY",
        type: "Selector",
        current: "节点 A",
        delay: 35,
        nodes: [
          { provider: "订阅 A", name: "节点 A", type: "VLESS", delay: 35, alive: true },
          { name: "DIRECT", type: "Direct", delay: null, alive: true },
        ],
      }],
    };
    const switchedOverview: OverviewData = {
      ...selectedOverview,
      providerNodes: [{ provider: "订阅 B", name: "节点 B", type: "Trojan", delay: 72, alive: true }],
      groups: [{
        ...selectedOverview.groups[0],
        current: "节点 B",
        delay: 72,
        nodes: [
          { provider: "订阅 B", name: "节点 B", type: "Trojan", delay: 72, alive: true },
          { name: "DIRECT", type: "Direct", delay: null, alive: true },
        ],
      }],
    };
    const client = createFakeClient();
    client.getOverview = vi.fn()
      .mockResolvedValueOnce(selectedOverview)
      .mockResolvedValueOnce(switchedOverview);
    const activeProviderClient: ActiveProviderClient = {
      get: vi.fn(async () => ({ providers: ["订阅 A", "订阅 B"], activeProvider: "订阅 A" })),
      select: vi.fn(async () => ({ providers: ["订阅 A", "订阅 B"], activeProvider: "订阅 B" })),
    };
    const providerManager: ProviderManagerClient = {
      list: vi.fn(async () => []),
      create: vi.fn(async () => []),
      update: vi.fn(async () => []),
      remove: vi.fn(async () => []),
    };

    render(<App client={client} providerManager={providerManager} activeProviderClient={activeProviderClient} />);

    await user.click(screen.getByRole("button", { name: "订阅" }));
    expect(await screen.findByRole("button", { name: "选择订阅 订阅 A" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "选择订阅 订阅 B" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Compatible · 2 个节点")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择订阅 订阅 B" }));

    await waitFor(() => expect(activeProviderClient.select).toHaveBeenCalledWith("订阅 B"));
    await waitFor(() => expect(client.getOverview).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("button", { name: "代理" }));
    await user.click(screen.getByRole("button", { name: "查看 PROXY" }));

    expect(screen.getByRole("button", { name: "节点 B 72 ms" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "节点 A 35 ms" })).not.toBeInTheDocument();
  });

  it("opens the focused proxy, profile, connection, log, and settings pages", async () => {
    const user = userEvent.setup();
    const TestApp = App as React.ComponentType<{ client: MihomoClient }>;
    render(<TestApp client={createFakeClient()} />);

    await user.click(screen.getByRole("button", { name: "代理" }));
    expect(screen.getByRole("heading", { name: "代理" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "订阅" }));
    expect(screen.getByRole("heading", { name: "订阅" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "连接" }));
    expect(screen.getByRole("heading", { name: "活动连接" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "日志" }));
    expect(screen.getByRole("heading", { name: "实时日志" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
  });

  it("attaches a custom group and sets it as the rule proxy", async () => {
    const user = userEvent.setup();
    const customGroup: ManagedAutoGroup = {
      name: "我的自定义",
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      nodes: [{ provider: "测试订阅", name: "测试节点" }],
    };
    const routeOverview: OverviewData = {
      ...overview,
      groups: [
        { name: "PROXY", type: "Selector", current: "自动选择", delay: 28, nodes: [] },
        ...overview.groups,
        { name: customGroup.name, type: "URLTest", current: "测试节点", delay: 28, nodes: [] },
      ],
    };
    const client = createFakeClient();
    client.getOverview = vi.fn(async () => routeOverview);
    const manager: AutoGroupManagerClient = {
      list: vi.fn(async () => [customGroup]),
      create: vi.fn(async () => [customGroup]),
      update: vi.fn(async () => [customGroup]),
      attach: vi.fn(async () => [customGroup]),
      remove: vi.fn(async () => []),
    };

    render(<App client={client} autoGroupManager={manager} />);
    await user.click(screen.getByRole("button", { name: "代理" }));
    await user.click(await screen.findByRole("button", { name: `设为规则代理 ${customGroup.name}` }));

    await waitFor(() => expect(manager.attach).toHaveBeenCalledWith(customGroup.name));
    await waitFor(() => expect(client.selectProxy).toHaveBeenCalledWith("PROXY", customGroup.name));
  });

  it("sets a custom automatic group as the global proxy through the GLOBAL → PROXY chain", async () => {
    const user = userEvent.setup();
    const customGroup: ManagedAutoGroup = {
      name: "全球自动优选",
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      nodes: [{ provider: "测试订阅", name: "测试节点" }],
    };
    const globalOverview: OverviewData = {
      ...overview,
      mode: "global",
      groups: [
        {
          name: "GLOBAL",
          type: "Selector",
          current: "DIRECT",
          delay: null,
          nodes: [
            { name: "DIRECT", type: "Direct", delay: null, alive: true },
            { name: "PROXY", type: "Selector", delay: null, alive: true },
          ],
        },
        {
          name: "PROXY",
          type: "Selector",
          current: "AUTO",
          delay: null,
          nodes: [{ name: customGroup.name, type: "URLTest", delay: null, alive: true }],
        },
        { name: customGroup.name, type: "URLTest", current: "测试节点", delay: 28, nodes: [] },
      ],
    };
    const client = createFakeClient();
    client.getOverview = vi.fn(async () => globalOverview);
    const manager: AutoGroupManagerClient = {
      list: vi.fn(async () => [customGroup]),
      create: vi.fn(async () => [customGroup]),
      update: vi.fn(async () => [customGroup]),
      attach: vi.fn(async () => [customGroup]),
      remove: vi.fn(async () => []),
    };

    render(<App client={client} autoGroupManager={manager} />);
    await user.click(screen.getByRole("button", { name: "代理" }));
    await user.click(await screen.findByRole("button", { name: `设为全局代理 ${customGroup.name}` }));

    await waitFor(() => expect(manager.attach).toHaveBeenCalledWith(customGroup.name));
    await waitFor(() => expect(client.selectProxy).toHaveBeenNthCalledWith(1, "GLOBAL", "PROXY"));
    await waitFor(() => expect(client.selectProxy).toHaveBeenNthCalledWith(2, "PROXY", customGroup.name));
  });
});
