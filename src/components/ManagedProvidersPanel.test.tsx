import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedProxyProvider, ProviderManagerClient } from "../api/provider-manager";
import { ManagedProvidersPanel } from "./ManagedProvidersPanel";

const provider: ManagedProxyProvider = {
  name: "机场订阅",
  type: "http",
  url: "https://sub.example.com",
  path: "./proxy_providers/airport.yaml",
  interval: 3600,
  proxy: "DIRECT",
  filter: "",
  excludeFilter: "",
  healthCheck: {
    enable: true,
    url: "https://www.gstatic.com/generate_204",
    interval: 300,
    lazy: true,
  },
};

afterEach(() => {
  cleanup();
});

function fakeManager(initial: ManagedProxyProvider[] = []): ProviderManagerClient {
  return {
    list: vi.fn(async () => initial),
    create: vi.fn(async (next) => [...initial, next]),
    update: vi.fn(async (_name, next) => [next]),
    remove: vi.fn(async () => []),
  };
}

describe("managed proxy providers", () => {
  it("loads immediately and adds an HTTP provider", async () => {
    const user = userEvent.setup();
    const manager = fakeManager();
    render(<ManagedProvidersPanel manager={manager} />);

    await screen.findByRole("button", { name: "添加提供者" });
    expect(manager.list).toHaveBeenCalledWith();
    await user.click(await screen.findByRole("button", { name: "添加提供者" }));

    const dialog = screen.getByRole("dialog", { name: "添加代理提供者" });
    await user.type(screen.getByLabelText("提供者名称", { selector: "input" }), "新订阅");
    await user.type(screen.getByLabelText("订阅地址", { selector: "input" }), "https://new.example.com/sub");
    await user.clear(screen.getByLabelText("更新间隔（分钟）"));
    await user.type(screen.getByLabelText("更新间隔（分钟）"), "120");
    await user.click(screen.getByRole("button", { name: "保存提供者" }));

    expect(dialog).not.toBeInTheDocument();
    expect(manager.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "新订阅",
      type: "http",
      url: "https://new.example.com/sub",
      interval: 7200,
    }));
    expect(await screen.findByText("新订阅")).toBeInTheDocument();
  }, 10_000);

  it("notifies the shell after a provider is created so proxy candidates can refresh", async () => {
    const user = userEvent.setup();
    const manager = fakeManager();
    const onChanged = vi.fn(async () => undefined);
    render(<ManagedProvidersPanel manager={manager} {...{ onChanged }} />);

    await user.click(await screen.findByRole("button", { name: "添加提供者" }));
    await user.type(screen.getByLabelText("提供者名称", { selector: "input" }), "新订阅");
    await user.type(screen.getByLabelText("订阅地址", { selector: "input" }), "https://new.example.com/sub");
    await user.click(screen.getByRole("button", { name: "保存提供者" }));

    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({
      action: "create",
      provider: expect.objectContaining({ name: "新订阅" }),
    }));
  }, 10_000);

  it("edits, renames, and deletes an existing provider", async () => {
    const user = userEvent.setup();
    const manager = fakeManager([provider]);
    render(<ManagedProvidersPanel manager={manager} />);
    await screen.findByRole("button", { name: "编辑 机场订阅" });

    await user.click(await screen.findByRole("button", { name: "编辑 机场订阅" }));
    const nameInput = screen.getByLabelText("提供者名称", { selector: "input" });
    await user.clear(nameInput);
    await user.type(nameInput, "备用订阅");
    await user.click(screen.getByRole("button", { name: "保存提供者" }));

    expect(manager.update).toHaveBeenCalledWith("机场订阅", expect.objectContaining({ name: "备用订阅" }));
    expect(await screen.findByText("备用订阅")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除 备用订阅" }));
    expect(screen.getByRole("dialog", { name: "删除代理提供者" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(manager.remove).toHaveBeenCalledWith("备用订阅");
    expect(screen.queryByText("备用订阅")).not.toBeInTheDocument();
  }, 10_000);
});
