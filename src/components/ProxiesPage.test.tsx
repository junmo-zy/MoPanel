import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoGroupManagerClient, ManagedAutoGroup } from "../api/auto-group-manager";
import type { ProviderProxyNode, ProxyGroup } from "../api/types";
import { ProxiesPage } from "./ProxiesPage";

const groups: ProxyGroup[] = [
  {
    name: "AUTO",
    type: "URLTest",
    current: "香港 01",
    delay: 42,
    nodes: [{ name: "香港 01", type: "VLESS", delay: 42, alive: true, provider: "机场订阅" }],
  },
];

const providerNodes: ProviderProxyNode[] = [
  { provider: "机场订阅", name: "香港 01", type: "VLESS", delay: 42, alive: true },
  { provider: "机场订阅", name: "日本 02", type: "Hysteria2", delay: 78, alive: true },
];

const customGroup: ManagedAutoGroup = {
  name: "低延迟优选",
  url: "https://www.gstatic.com/generate_204",
  interval: 300,
  tolerance: 50,
  nodes: [{ provider: "机场订阅", name: "香港 01" }],
};

function createManager(): AutoGroupManagerClient {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => [customGroup]),
    update: vi.fn(async () => [customGroup]),
    attach: vi.fn(async () => [customGroup]),
    remove: vi.fn(async () => []),
  };
}

describe("ProxiesPage auto groups", () => {
  it("saves a custom automatic group, refreshes its test result, and marks it as custom", async () => {
    const user = userEvent.setup();
    const manager = createManager();
    const onTestGroup = vi.fn(async () => undefined);
    const onRefresh = vi.fn(async () => undefined);
    render(
      <ProxiesPage
        groups={[...groups, { ...groups[0], name: customGroup.name }]}
        providerNodes={providerNodes}
        manager={manager}
        speedTestUrl="https://www.gstatic.com/generate_204"
        onTestGroup={onTestGroup}
        onTestAll={vi.fn(async () => undefined)}
        onRefresh={onRefresh}
        mode="rule"
        activeProxyGroupName={null}
        onUseAutoGroup={vi.fn(async () => undefined)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "新建自动组" }));
    await user.type(screen.getByLabelText("代理组名称"), customGroup.name);
    await user.click(screen.getByLabelText("香港 01"));
    await user.click(screen.getByRole("button", { name: "保存自动组" }));

    await waitFor(() => expect(manager.create).toHaveBeenCalledWith(customGroup));
    await waitFor(() => expect(onTestGroup).toHaveBeenCalledWith(customGroup.name));
    expect(screen.getByText("自定义")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `编辑 ${customGroup.name}` })).toBeInTheDocument();
  }, 10_000);

  it("confirms before deleting a custom group", async () => {
    const user = userEvent.setup();
    const manager = createManager();
    manager.list = vi.fn(async () => [customGroup]);
    const onRefresh = vi.fn(async () => undefined);
    render(
      <ProxiesPage
        groups={[...groups, { ...groups[0], name: customGroup.name }]}
        providerNodes={providerNodes}
        manager={manager}
        speedTestUrl="https://www.gstatic.com/generate_204"
        onTestGroup={vi.fn(async () => undefined)}
        onTestAll={vi.fn(async () => undefined)}
        onRefresh={onRefresh}
        mode="rule"
        activeProxyGroupName={null}
        onUseAutoGroup={vi.fn(async () => undefined)}
      />,
    );

    await screen.findByRole("button", { name: `删除 ${customGroup.name}` });
    await user.click(screen.getByRole("button", { name: `删除 ${customGroup.name}` }));
    expect(screen.getByRole("dialog", { name: "删除自动组" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(manager.remove).toHaveBeenCalledWith(customGroup.name));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it("adds an existing custom group to PROXY and makes it the active route", async () => {
    const user = userEvent.setup();
    const manager = createManager();
    manager.list = vi.fn(async () => [customGroup]);
    const onUseAutoGroup = vi.fn(async () => undefined);
    render(
      <ProxiesPage
        groups={[
          { name: "PROXY", type: "Selector", current: "AUTO", delay: null, nodes: [] },
          ...groups,
          { ...groups[0], name: customGroup.name },
        ]}
        providerNodes={providerNodes}
        manager={manager}
        speedTestUrl="https://www.gstatic.com/generate_204"
        onTestGroup={vi.fn(async () => undefined)}
        onTestAll={vi.fn(async () => undefined)}
        onRefresh={vi.fn(async () => undefined)}
        mode="rule"
        activeProxyGroupName={null}
        onUseAutoGroup={onUseAutoGroup}
      />,
    );

    await user.click(await screen.findByRole("button", { name: `设为规则代理 ${customGroup.name}` }));

    await waitFor(() => expect(manager.attach).toHaveBeenCalledWith(customGroup.name));
    await waitFor(() => expect(onUseAutoGroup).toHaveBeenCalledWith(customGroup.name));
  });
});

describe("ProxiesPage node cards", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  const selector: ProxyGroup = {
    name: "节点选择",
    type: "Selector",
    current: "香港 01",
    delay: 42,
    nodes: [
      { name: "香港 01", type: "VLESS", delay: 420, alive: true, udp: true },
      { name: "日本 02", type: "Hysteria2", delay: 78, alive: true },
      { name: "美国 03", type: "Trojan", delay: null, alive: false },
      { name: "新加坡 04", type: "Trojan", delay: null, alive: true },
    ],
  };

  function renderPage(overrides: Partial<React.ComponentProps<typeof ProxiesPage>> = {}) {
    const props = {
      groups: [selector, groups[0], { name: "GLOBAL", type: "Selector", current: "节点选择", delay: null, nodes: [] }],
      providerNodes,
      manager: createManager(),
      speedTestUrl: "https://www.gstatic.com/generate_204",
      onTestGroup: vi.fn(async () => undefined),
      onTestAll: vi.fn(async () => undefined),
      onRefresh: vi.fn(async () => undefined),
      mode: "rule" as const,
      onSelectNode: vi.fn(async () => undefined),
      onTestNode: vi.fn(async () => 50),
      activeProxyGroupName: null,
      onUseAutoGroup: vi.fn(async () => undefined),
      ...overrides,
    };
    return { props, ...render(<ProxiesPage {...props} />) };
  }

  it("shows delay states, hides GLOBAL in rule mode and treats URLTest groups as view-only", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole("region", { name: "GLOBAL" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测速 香港 01" })).toHaveTextContent("420 ms");
    expect(screen.getByRole("button", { name: "测速 美国 03" })).toHaveTextContent("超时");
    expect(screen.getByRole("button", { name: "测速 新加坡 04" })).toHaveTextContent("测速");
    expect(within(screen.getByRole("region", { name: "节点选择" })).getByText("UDP")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开 AUTO" }));
    const auto = screen.getByRole("region", { name: "AUTO" });
    expect(within(auto).getByText(/只能查看和测速/)).toBeInTheDocument();
    expect(within(auto).queryByRole("button", { name: "香港 01" })).not.toBeInTheDocument();
  });

  it("shows GLOBAL first in global mode", () => {
    renderPage({ mode: "global" });
    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))[0]).toBe("GLOBAL");
  });

  it("remembers collapsed groups and sorts by delay", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();

    await user.click(screen.getByRole("button", { name: "节点选择 排序，当前默认排序" }));
    const names = within(screen.getByRole("region", { name: "节点选择" }))
      .getAllByRole("button", { pressed: false }).map((button) => button.getAttribute("aria-label"));
    // Clash Verge order: measured, then timeouts, then untested.
    expect(names).toEqual(["日本 02", "美国 03", "新加坡 04"]);

    await user.click(screen.getByRole("button", { name: "收起 节点选择" }));
    unmount();
    renderPage();
    expect(screen.getByRole("button", { name: "展开 节点选择" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "节点选择 排序，当前按延迟排序" })).toBeInTheDocument();
  });

  it("filters nodes with the group search and selects or tests a node", async () => {
    const user = userEvent.setup();
    const { props } = renderPage();

    await user.click(screen.getByRole("button", { name: "搜索 节点选择 节点" }));
    await user.type(screen.getByPlaceholderText("搜索节点"), "日本");
    expect(screen.queryByRole("button", { name: "香港 01" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "日本 02" }));
    expect(props.onSelectNode).toHaveBeenCalledWith("节点选择", "日本 02");
    await user.click(screen.getByRole("button", { name: "测速 日本 02" }));
    expect(props.onTestNode).toHaveBeenCalledWith(expect.objectContaining({ name: "日本 02" }), "节点选择");
  });

  it("renders very large groups in batches and still locates a far-away current node", async () => {
    const user = userEvent.setup();
    const many: ProxyGroup = {
      name: "大组",
      type: "Selector",
      current: "节点 300",
      delay: null,
      nodes: Array.from({ length: 300 }, (_, index) => ({ name: `节点 ${index + 1}`, type: "Trojan", delay: null, alive: true })),
    };
    renderPage({ groups: [many] });

    const region = screen.getByRole("region", { name: "大组" });
    expect(region.querySelectorAll(".node-card")).toHaveLength(120);
    await user.click(screen.getByRole("button", { name: "显示更多（还有 180 个）" }));
    expect(region.querySelectorAll(".node-card")).toHaveLength(240);

    await user.click(screen.getByRole("button", { name: "定位 大组 当前节点" }));
    expect(within(region).getByRole("button", { name: "节点 300" })).toHaveAttribute("aria-pressed", "true");
  });
});
