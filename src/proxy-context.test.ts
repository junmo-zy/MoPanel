import { describe, expect, it } from "vitest";
import type { OverviewData } from "./api/types";
import { getProxyActivationSteps, getProxyActivationTarget, resolveCurrentProxy } from "./proxy-context";

const base: OverviewData = {
  connected: true,
  version: "v-test",
  mode: "rule",
  mixedPort: 7890,
  allowLan: false,
  downloadTotal: 0,
  uploadTotal: 0,
  connectionCount: 0,
  tcpCount: 0,
  udpCount: 0,
  providers: [],
  providerNodes: [],
  groups: [],
};

describe("current proxy context", () => {
  it("resolves the selected automatic group and node in rule mode", () => {
    const data: OverviewData = {
      ...base,
      groups: [
        { name: "PROXY", type: "Selector", current: "自定义优选", delay: 42, nodes: [] },
        { name: "自定义优选", type: "URLTest", current: "日本 02", delay: 42, nodes: [] },
      ],
    };

    expect(resolveCurrentProxy(data)).toMatchObject({
      selectorName: "PROXY",
      groupName: "自定义优选",
      nodeName: "日本 02",
      canChange: true,
    });
  });

  it("uses GLOBAL as the activation target when it directly contains the selected group", () => {
    const data: OverviewData = {
      ...base,
      mode: "global",
      groups: [
        {
          name: "GLOBAL",
          type: "Selector",
          current: "DIRECT",
          delay: null,
          nodes: [{ name: "自定义优选", type: "URLTest", delay: null, alive: true }],
        },
        { name: "自定义优选", type: "URLTest", current: "新加坡 01", delay: 51, nodes: [] },
      ],
    };

    expect(getProxyActivationTarget(data, "自定义优选")?.name).toBe("GLOBAL");
  });

  it("uses the active nested selector when GLOBAL delegates to it", () => {
    const data: OverviewData = {
      ...base,
      mode: "global",
      groups: [
        { name: "GLOBAL", type: "Selector", current: "PROXY", delay: null, nodes: [] },
        {
          name: "PROXY",
          type: "Selector",
          current: "AUTO",
          delay: 42,
          nodes: [{ name: "自定义优选", type: "URLTest", delay: null, alive: true }],
        },
        { name: "自定义优选", type: "URLTest", current: "日本 02", delay: 42, nodes: [] },
      ],
    };

    expect(getProxyActivationTarget(data, "自定义优选")?.name).toBe("PROXY");
  });

  it("builds the full selector chain when GLOBAL must enter PROXY before choosing a managed group", () => {
    const data: OverviewData = {
      ...base,
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
          nodes: [{ name: "custom-auto", type: "URLTest", delay: null, alive: true }],
        },
        { name: "custom-auto", type: "URLTest", current: "node-a", delay: 42, nodes: [] },
      ],
    };

    expect(getProxyActivationSteps(data, "custom-auto")).toEqual([
      { selectorName: "GLOBAL", nodeName: "PROXY" },
      { selectorName: "PROXY", nodeName: "custom-auto" },
    ]);
    expect(getProxyActivationTarget(data, "custom-auto")?.name).toBe("PROXY");
  });

  it("keeps the GLOBAL → PROXY activation chain valid while a just-attached group is absent from a stale snapshot", () => {
    const data: OverviewData = {
      ...base,
      mode: "global",
      groups: [
        {
          name: "GLOBAL",
          type: "Selector",
          current: "DIRECT",
          delay: null,
          nodes: [{ name: "PROXY", type: "Selector", delay: null, alive: true }],
        },
        { name: "PROXY", type: "Selector", current: "AUTO", delay: null, nodes: [] },
      ],
    };

    expect(getProxyActivationSteps(data, "just-attached")).toEqual([
      { selectorName: "GLOBAL", nodeName: "PROXY" },
      { selectorName: "PROXY", nodeName: "just-attached" },
    ]);
  });

  it("does not expose a proxy selector while direct mode is active", () => {
    const data: OverviewData = { ...base, mode: "direct" };

    expect(resolveCurrentProxy(data)).toMatchObject({
      selectorName: null,
      groupName: null,
      nodeName: null,
      canChange: false,
    });
    expect(getProxyActivationTarget(data, "自定义优选")).toBeNull();
  });
});
