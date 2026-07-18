import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ProxyGroup } from "../api/types";
import { NodeSwitcher } from "./NodeSwitcher";

const group: ProxyGroup = {
  name: "自动选择",
  type: "Selector",
  current: "香港 01",
  delay: 42,
  nodes: [
    { name: "香港 01", type: "VLESS", delay: 42, alive: true },
    { name: "新加坡 01", type: "Hysteria2", delay: 65, alive: true },
  ],
};

describe("NodeSwitcher", () => {
  it("uses a compact modal presentation with its own light backdrop", () => {
    render(
      <NodeSwitcher
        group={group}
        onClose={vi.fn()}
        onSelect={vi.fn(async () => undefined)}
        onTest={vi.fn(async () => 42)}
        onTestGroup={vi.fn(async () => undefined)}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "选择节点" });

    expect(dialog).toHaveAttribute("data-presentation", "modal");
    expect(dialog.querySelector(".node-modal")).toBeInTheDocument();
    expect(dialog.querySelector(".node-backdrop")).toBeInTheDocument();
    expect(dialog.querySelector(".node-drawer")).not.toBeInTheDocument();
  });

  it("focuses search on open and closes with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <NodeSwitcher
        group={group}
        onClose={onClose}
        onSelect={vi.fn(async () => undefined)}
        onTest={vi.fn(async () => 42)}
        onTestGroup={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByRole("textbox", { name: "搜索节点" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("runs a speed test for the open proxy group from the header action", async () => {
    const user = userEvent.setup();
    const onTestGroup = vi.fn(async () => undefined);

    render(
      <NodeSwitcher
        group={group}
        onClose={vi.fn()}
        onSelect={vi.fn(async () => undefined)}
        onTest={vi.fn(async () => 42)}
        onTestGroup={onTestGroup}
      />,
    );

    await user.click(screen.getByRole("button", { name: "测速此组" }));

    await waitFor(() => expect(onTestGroup).toHaveBeenCalledWith("自动选择"));
  });

  it("keeps URLTest groups in automatic mode instead of offering a manual fixed selection", () => {
    render(
      <NodeSwitcher
        group={{ ...group, type: "URLTest" }}
        onClose={vi.fn()}
        onSelect={vi.fn(async () => undefined)}
        onTest={vi.fn(async () => 42)}
        onTestGroup={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText("此组会按延迟自动切换节点。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^香港 01 42 ms$/ })).not.toBeInTheDocument();
    expect(screen.getByText("香港 01")).toBeInTheDocument();
  });

  it("keeps Fallback groups managed by Mihomo instead of offering a manual fixed selection", () => {
    render(
      <NodeSwitcher
        group={{ ...group, type: "Fallback" }}
        onClose={vi.fn()}
        onSelect={vi.fn(async () => undefined)}
        onTest={vi.fn(async () => 42)}
        onTestGroup={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByRole("heading", { name: "故障转移" })).toBeInTheDocument();
    expect(screen.getByText("此代理组由 Mihomo 自动管理。" )).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^香港 01 42 ms$/ })).not.toBeInTheDocument();
  });
});
