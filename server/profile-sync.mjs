// Clash-Verge-style subscriptions: a subscription link is a complete Clash
// profile (nodes + proxy groups + rules). MoPanel keeps the nodes coming from
// its proxy-provider (so node counts, usage, health checks and custom auto
// groups keep working) and takes the profile's groups, rules and rule sets,
// rewiring explicit node lists to that provider. Base settings (ports, LAN,
// controller, mode, TUN …) always stay those of the user's config.yaml.
import { parse, parseDocument } from "yaml";
import {
  attachToProxySelector,
  exactNodeFilter,
  groupHasMembers,
  mainSelectorIndex,
  managedAutoGroupNames,
  ProviderConfigError,
  switchSubscriptionYaml,
} from "./provider-config.mjs";

export const PROFILE_USER_AGENT = "clash-verge/v2.2.3 mihomo/1.19";
const BUILTIN_TARGETS = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL"]);
const LOGICAL_RULES = new Set(["AND", "OR", "NOT", "SUB-RULE"]);
// Taken from the profile only when config.yaml does not define them itself.
const OPTIONAL_PROFILE_KEYS = [
  "dns", "hosts", "sniffer", "geox-url", "geodata-mode", "geodata-loader",
  "geo-auto-update", "geo-update-interval", "global-client-fingerprint",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Returns the usable parts of a Clash profile, or null when it has no rules. */
export function parseProfile(text) {
  let data;
  try {
    data = parse(String(text || ""), { maxAliasCount: 10_000 });
  } catch {
    return null;
  }
  if (!isObject(data)) return null;
  const rules = Array.isArray(data.rules) ? data.rules.filter((rule) => typeof rule === "string" && rule.trim()) : [];
  const groups = Array.isArray(data["proxy-groups"]) ? data["proxy-groups"].filter((group) => isObject(group) && typeof group.name === "string") : [];
  if (rules.length === 0 || groups.length === 0) return null;
  const nodeNames = new Set((Array.isArray(data.proxies) ? data.proxies : [])
    .map((proxy) => (isObject(proxy) ? proxy.name : undefined))
    .filter((name) => typeof name === "string"));
  const extras = {};
  for (const key of OPTIONAL_PROFILE_KEYS) {
    if (data[key] !== undefined) extras[key] = data[key];
  }
  if (isObject(extras.dns)) {
    // MoPanel's core serves the LAN through its proxy port, not as a DNS server.
    extras.dns = { ...extras.dns };
    delete extras.dns.listen;
  }
  return {
    nodeNames,
    groups,
    rules,
    ruleProviders: isObject(data["rule-providers"]) ? data["rule-providers"] : {},
    providers: isObject(data["proxy-providers"]) ? data["proxy-providers"] : {},
    extras,
  };
}

/** Rewires a profile's groups so explicit node names come from `provider`. */
export function convertProfileGroups(groups, provider, nodeNames) {
  const groupNames = new Set(groups.map((group) => group.name));
  return groups.map((group) => {
    const next = { ...group };
    const listed = Array.isArray(group.proxies) ? group.proxies.filter((name) => typeof name === "string") : [];
    const kept = listed.filter((name) => groupNames.has(name) || BUILTIN_TARGETS.has(name));
    const nodes = listed.filter((name) => nodeNames.has(name) && !groupNames.has(name));
    if (group["include-all-proxies"] === true) {
      // Profile nodes now live in the provider, which include-all-proxies skips.
      delete next["include-all-proxies"];
      next.use = [...new Set([...(Array.isArray(next.use) ? next.use : []), provider])];
    } else if (nodes.length > 0) {
      if (Array.isArray(next.use) || next.filter) {
        // Mixing its own providers or a regex filter: add ours unfiltered.
        next.use = [...new Set([...(Array.isArray(next.use) ? next.use : []), provider])];
      } else {
        next.use = [provider];
        // Whole-subscription groups need no filter, so renamed nodes still appear.
        if (nodes.length < nodeNames.size) next.filter = exactNodeFilter(nodes.map((name) => ({ name })));
      }
    }
    if (kept.length > 0) next.proxies = kept;
    else delete next.proxies;
    if (!groupHasMembers(next)) next.proxies = ["DIRECT"];
    return next;
  });
}

function ruleTargetIndex(parts) {
  const type = parts[0]?.trim().toUpperCase();
  if (!type || LOGICAL_RULES.has(type)) return -1;
  return type === "MATCH" || type === "FINAL" ? 1 : 2;
}

/** Points rules at existing groups; returns how many targets were repaired. */
export function repairRuleTargets(rules, groupNames, fallback) {
  let repaired = 0;
  const next = rules.map((rule) => {
    const parts = rule.split(",");
    const index = ruleTargetIndex(parts);
    if (index < 0 || index >= parts.length) return rule;
    const target = parts[index].trim();
    if (groupNames.has(target) || BUILTIN_TARGETS.has(target)) return rule;
    repaired += 1;
    parts[index] = fallback;
    return parts.join(",");
  });
  return { rules: next, repaired };
}

function stripManaged(groups, managed) {
  return groups
    .filter((group) => isObject(group) && !managed.has(group.name))
    .map((group) => (Array.isArray(group.proxies)
      ? { ...group, proxies: group.proxies.filter((name) => !managed.has(name)) }
      : group));
}

/** The user's own groups and rules, saved before a profile replaces them. */
export function takeLocalSnapshot(source, metadata) {
  const data = parseDocument(source).toJSON() || {};
  const managed = managedAutoGroupNames(metadata);
  return {
    "proxy-groups": stripManaged(Array.isArray(data["proxy-groups"]) ? data["proxy-groups"] : [], managed),
    rules: Array.isArray(data.rules) ? data.rules : [],
    "rule-providers": isObject(data["rule-providers"]) ? data["rule-providers"] : {},
  };
}

/**
 * Builds the next config.yaml for `provider`.
 * profile: parseProfile() result, or null to use the user's local rules.
 * state: previous profile state ({ mode, injectedKeys, injectedProviders }).
 */
export function buildSubscriptionConfig(source, { provider, profile, metadata, snapshot, state }) {
  const document = parseDocument(source);
  if (document.errors.length) throw new ProviderConfigError(`配置文件无法解析：${document.errors[0].message}`, "INVALID_YAML");
  const current = document.toJSON() || {};
  const managed = managedAutoGroupNames(metadata);
  const managedGroups = (Array.isArray(current["proxy-groups"]) ? current["proxy-groups"] : [])
    .filter((group) => isObject(group) && managed.has(group.name));
  const inProfileMode = state?.mode === "profile";
  const localSnapshot = inProfileMode && snapshot ? snapshot : takeLocalSnapshot(source, metadata);

  // Undo what a previous profile added on top of the base config, and always
  // append the replaced sections in the same order so re-syncs are stable.
  for (const key of state?.injectedKeys || []) document.delete(key);
  for (const key of ["proxy-groups", "rule-providers", "rules"]) document.delete(key);
  const providersNode = document.get("proxy-providers", true);
  for (const name of state?.injectedProviders || []) providersNode?.delete?.(name);
  const configuredProviders = Object.keys(document.get("proxy-providers", true)?.toJSON?.() || {});
  if (!configuredProviders.includes(provider)) {
    throw new ProviderConfigError("所选订阅不在当前配置中", "ACTIVE_PROVIDER_NOT_FOUND");
  }

  let groups;
  let rules;
  let ruleProviders;
  const injectedKeys = [];
  const injectedProviders = [];
  let repaired = 0;

  if (profile) {
    groups = convertProfileGroups(profile.groups, provider, profile.nodeNames);
    for (const [name, value] of Object.entries(profile.providers)) {
      if (configuredProviders.includes(name)) continue;
      document.setIn(["proxy-providers", name], value);
      injectedProviders.push(name);
    }
    for (const [key, value] of Object.entries(profile.extras)) {
      if (document.has(key)) continue;
      document.set(key, value);
      injectedKeys.push(key);
    }
    rules = profile.rules;
    ruleProviders = profile.ruleProviders;
  } else {
    const allProviders = new Set(configuredProviders);
    groups = localSnapshot["proxy-groups"].map((group) => (Array.isArray(group.use)
      ? { ...group, use: group.use.filter((name) => allProviders.has(name)) }
      : group));
    rules = localSnapshot.rules;
    ruleProviders = localSnapshot["rule-providers"];
  }

  // Custom auto groups survive every switch and join the main selector.
  const taken = new Set(groups.map((group) => group.name));
  for (const group of managedGroups) {
    if (taken.has(group.name)) continue;
    groups.push(group);
    attachToProxySelector(groups, group.name);
  }

  const mainIndex = mainSelectorIndex(groups, managed);
  const fallback = mainIndex >= 0 ? groups[mainIndex].name : "DIRECT";
  const fixed = repairRuleTargets(rules, new Set(groups.map((group) => group.name)), fallback);
  rules = fixed.rules;
  repaired = fixed.repaired;

  document.set("proxy-groups", groups);
  if (Object.keys(ruleProviders).length > 0) document.set("rule-providers", ruleProviders);
  document.set("rules", rules);

  let yaml = document.toString({ lineWidth: 0 });
  // Local rules: point the subscription groups at the chosen provider.
  if (!profile) yaml = switchSubscriptionYaml(yaml, provider, metadata);

  return {
    yaml,
    snapshot: localSnapshot,
    state: {
      mode: profile ? "profile" : "local",
      provider,
      injectedKeys,
      injectedProviders,
      ruleCount: rules.length,
      groupCount: groups.length,
      repairedRules: repaired,
      syncedAt: new Date().toISOString(),
    },
  };
}
