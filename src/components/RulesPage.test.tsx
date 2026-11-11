import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MihomoClient } from "../api/types";
import { RulesPage } from "./RulesPage";

function client(count = 3): MihomoClient {
  const rules = [
    { type: "DomainSuffix", payload: "github.com", proxy: "PROXY" },
    { type: "RuleSet", payload: "广告域名", proxy: "REJECT" },
    { type: "Match", payload: "", proxy: "DIRECT" },
    ...Array.from({ length: Math.max(0, count - 3) }, (_, index) => ({ type: "DomainSuffix", payload: `site${index}.example`, proxy: "PROXY" })),
  ];
  return {
    getRules: vi.fn(async () => rules),
    getRuleProviders: vi.fn(async () => [{ name: "广告域名", behavior: "Domain", format: "YamlRule", vehicleType: "HTTP", ruleCount: 800, updatedAt: null }]),
    updateRuleProvider: vi.fn(async () => undefined),
  } as unknown as MihomoClient;
}

describe("RulesPage", () => {
  it("lists rules in order with rule-set sizes, filters them and updates rule sets", async () => {
    const user = userEvent.setup();
    const fake = client();
    const onNotice = vi.fn();
    render(<RulesPage client={fake} onNotice={onNotice} />);

    const list = await screen.findByRole("list", { name: "规则列表" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(3));
    expect(within(list).getByText("800 条")).toBeInTheDocument();
    expect(within(list).getByText("其余所有流量")).toBeInTheDocument();
    expect(within(list).getByText("REJECT")).toHaveAttribute("data-tone", "reject");

    await user.type(screen.getByPlaceholderText(/搜索规则/), "github");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "规则集合 1" }));
    await user.click(screen.getByRole("button", { name: "更新 广告域名" }));
    expect(fake.updateRuleProvider).toHaveBeenCalledWith("广告域名");
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("规则集合 广告域名 已更新"));
  });

  it("renders long rule lists in batches", async () => {
    const user = userEvent.setup();
    render(<RulesPage client={client(450)} />);
    const list = await screen.findByRole("list", { name: "规则列表" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(200));
    await user.click(screen.getByRole("button", { name: "显示更多（还有 250 条）" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(400);
  });

  it("shows where the rules come from and syncs them from the subscription", async () => {
    const user = userEvent.setup();
    const fake = client();
    const onSyncRules = vi.fn(async () => undefined);
    render(<RulesPage client={fake} ruleSource={{ mode: "local", provider: "Hneko", ruleCount: 2 }} onSyncRules={onSyncRules} />);

    expect(screen.getByRole("note")).toHaveTextContent("规则来自本地配置");
    await user.click(screen.getByRole("button", { name: "从订阅同步" }));
    expect(onSyncRules).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fake.getRules).toHaveBeenCalledTimes(2));
  });
});
