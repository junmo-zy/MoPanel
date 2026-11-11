import type { OverviewData, ProxyGroup, ProxyMode } from "./api/types";

export interface CurrentProxyContext {
  selectorName: string | null;
  groupName: string | null;
  nodeName: string | null;
  canChange: boolean;
}

export interface ProxyActivationStep {
  selectorName: string;
  nodeName: string;
}

function normalizedType(type: string) {
  return type.replace(/[\s_-]/g, "").toLowerCase();
}

export function isManualProxyGroup(group: ProxyGroup) {
  return normalizedType(group.type) === "selector";
}

function preferredSelectorName(mode: ProxyMode) {
  return mode === "global" ? "GLOBAL" : "PROXY";
}

function findRootSelector(data: Pick<OverviewData, "mode" | "groups">): ProxyGroup | null {
  if (data.mode === "direct") return null;
  const preferred = data.groups.find((group) => group.name === preferredSelectorName(data.mode));
  if (preferred) return preferred;
  // Many subscriptions name their main selector something other than PROXY
  // (e.g. "节点选择"). In rule mode GLOBAL is never consulted by the rules, so
  // it must not be mistaken for the active selector.
  return data.groups.find((group) => isManualProxyGroup(group) && group.name !== "GLOBAL")
    || (data.mode === "global" ? data.groups.find(isManualProxyGroup) : undefined)
    || null;
}

export function resolveCurrentProxy(data: Pick<OverviewData, "mode" | "groups">): CurrentProxyContext {
  const selector = findRootSelector(data);
  if (!selector) {
    return {
      selectorName: null,
      groupName: null,
      nodeName: null,
      canChange: false,
    };
  }

  const groupsByName = new Map(data.groups.map((group) => [group.name, group]));
  const visited = new Set<string>([selector.name]);
  let displayedGroup = selector;
  let nodeName = selector.current;
  let child = groupsByName.get(selector.current);

  while (child && !visited.has(child.name)) {
    visited.add(child.name);
    displayedGroup = child;
    nodeName = child.current;
    if (!isManualProxyGroup(child)) break;
    child = groupsByName.get(child.current);
  }

  return {
    selectorName: selector.name,
    groupName: displayedGroup.name,
    nodeName,
    canChange: true,
  };
}

export function getProxyActivationSteps(
  data: Pick<OverviewData, "mode" | "groups">,
  proxyGroupName: string,
): ProxyActivationStep[] | null {
  const rootSelector = findRootSelector(data);
  if (!rootSelector) return null;
  const groupsByName = new Map(data.groups.map((group) => [group.name, group]));

  function findSteps(selector: ProxyGroup, visited: Set<string>): ProxyActivationStep[] | null {
    if (selector.nodes.some((node) => node.name === proxyGroupName) || selector.current === proxyGroupName) {
      return [{ selectorName: selector.name, nodeName: proxyGroupName }];
    }

    const childCandidates = new Set([selector.current, ...selector.nodes.map((node) => node.name)]);
    for (const childName of childCandidates) {
      const child = groupsByName.get(childName);
      if (!child || !isManualProxyGroup(child) || visited.has(child.name)) continue;
      const childSteps = findSteps(child, new Set([...visited, child.name]));
      if (childSteps) {
        return [{ selectorName: selector.name, nodeName: child.name }, ...childSteps];
      }
    }

    return null;
  }

  const steps = findSteps(rootSelector, new Set([rootSelector.name]));
  if (steps) return steps;

  const proxySelector = groupsByName.get("PROXY");
  if (proxySelector && isManualProxyGroup(proxySelector)) {
    const proxySelectorName = proxySelector.name;
    function findProxySelectorSteps(selector: ProxyGroup, visited: Set<string>): ProxyActivationStep[] | null {
      if (selector.name === proxySelectorName) return [];

      const childCandidates = new Set([selector.current, ...selector.nodes.map((node) => node.name)]);
      for (const childName of childCandidates) {
        const child = groupsByName.get(childName);
        if (!child || !isManualProxyGroup(child) || visited.has(child.name)) continue;
        const childSteps = findProxySelectorSteps(child, new Set([...visited, child.name]));
        if (childSteps) {
          return [{ selectorName: selector.name, nodeName: child.name }, ...childSteps];
        }
      }

      return null;
    }

    const proxySelectorSteps = findProxySelectorSteps(rootSelector, new Set([rootSelector.name]));
    if (proxySelectorSteps) {
      return [...proxySelectorSteps, { selectorName: proxySelectorName, nodeName: proxyGroupName }];
    }
  }

  // A just-attached group can be absent from the controller snapshot for one
  // refresh cycle. In rule mode PROXY is the panel's attachment point, so a
  // direct selection is safe while that snapshot catches up.
  return data.mode === "rule"
    ? [{ selectorName: rootSelector.name, nodeName: proxyGroupName }]
    : null;
}

export function getProxyActivationTarget(
  data: Pick<OverviewData, "mode" | "groups">,
  proxyGroupName: string,
): ProxyGroup | null {
  const steps = getProxyActivationSteps(data, proxyGroupName);
  const selectorName = steps?.at(-1)?.selectorName;
  return selectorName ? data.groups.find((group) => group.name === selectorName) || null : null;
}

export function proxyActivationLabel(mode: ProxyMode) {
  if (mode === "global") return "设为全局代理";
  if (mode === "rule") return "设为规则代理";
  return "直连模式下代理未生效";
}

export function proxyGroupTypeLabel(type: string) {
  switch (normalizedType(type)) {
    case "selector":
      return "手动选择";
    case "urltest":
      return "自动选优";
    case "fallback":
      return "故障转移";
    case "loadbalance":
      return "负载均衡";
    default:
      return "代理组";
  }
}
