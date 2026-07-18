import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
        onOpenGroup={vi.fn()}
        onTestGroup={onTestGroup}
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
        onOpenGroup={vi.fn()}
        onTestGroup={vi.fn(async () => undefined)}
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
        onOpenGroup={vi.fn()}
        onTestGroup={vi.fn(async () => undefined)}
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
