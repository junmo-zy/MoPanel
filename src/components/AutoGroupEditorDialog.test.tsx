import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ProviderProxyNode } from "../api/types";
import { AutoGroupEditorDialog } from "./AutoGroupEditorDialog";

const nodes: ProviderProxyNode[] = [
  { provider: "机场 A", name: "香港 01", type: "VLESS", delay: 42, alive: true },
  { provider: "机场 A", name: "日本 02", type: "Hysteria2", delay: 78, alive: true },
  { provider: "机场 B", name: "新加坡 01", type: "Trojan", delay: 65, alive: true },
];

describe("AutoGroupEditorDialog", () => {
  it("creates a URLTest group from explicitly selected provider nodes", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    render(
      <AutoGroupEditorDialog
        group={null}
        providerNodes={nodes}
        defaultTestUrl="https://cp.cloudflare.com/generate_204"
        saving={false}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.type(screen.getByLabelText("代理组名称"), "低延迟优选");
    await user.click(screen.getByLabelText("香港 01"));
    await user.click(screen.getByLabelText("新加坡 01"));
    await user.click(screen.getByRole("button", { name: "保存自动组" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "低延迟优选",
      url: "https://cp.cloudflare.com/generate_204",
      interval: 300,
      tolerance: 50,
      nodes: [
        { provider: "机场 A", name: "香港 01" },
        { provider: "机场 B", name: "新加坡 01" },
      ],
    });
  }, 10_000);

  it("filters available nodes and pre-fills an existing auto group", async () => {
    const user = userEvent.setup();
    render(
      <AutoGroupEditorDialog
        group={{
          name: "我的优选",
          url: "https://www.gstatic.com/generate_204",
          interval: 600,
          tolerance: 30,
          nodes: [{ provider: "机场 A", name: "日本 02" }],
        }}
        providerNodes={nodes}
        defaultTestUrl="https://cp.cloudflare.com/generate_204"
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByLabelText("代理组名称")).toHaveValue("我的优选");
    expect(screen.getByLabelText("日本 02")).toBeChecked();
    expect(screen.getByLabelText("测速间隔（分钟）")).toHaveValue(10);

    await user.type(screen.getByRole("textbox", { name: "搜索候选节点" }), "新加坡");

    expect(screen.queryByLabelText("香港 01")).not.toBeInTheDocument();
    expect(screen.getByLabelText("新加坡 01")).toBeInTheDocument();
  });
});
