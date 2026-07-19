import { isMap, parseDocument } from "yaml";

const DEFAULT_HEALTH_URL = "https://www.gstatic.com/generate_204";
const PROVIDER_TYPES = new Set(["http", "file", "inline"]);

export class ProviderConfigError extends Error {
  constructor(message, code = "INVALID_PROVIDER") {
    super(message);
    this.name = "ProviderConfigError";
    this.code = code;
  }
}

function parseYaml(source) {
  const document = parseDocument(source, { prettyErrors: true });
  if (document.errors.length > 0) {
    throw new ProviderConfigError(`配置文件无法解析：${document.errors[0].message}`, "INVALID_YAML");
  }
  return document;
}

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value, fallback, field, minimum = 1) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new ProviderConfigError(`${field}必须是不小于 ${minimum} 的整数`);
  }
  return number;
}

function defaultProviderPath(name) {
  const filename = name.replace(/[\\/:*?"<>|]/g, "_");
  return `./proxy_providers/${filename}.yaml`;
}

function validateProviderPath(value, name) {
  const path = trimmed(value) || defaultProviderPath(name);
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    normalized.startsWith("/")
    || /^[a-zA-Z]:/.test(normalized)
    || segments.includes("..")
    || normalized.includes("\0")
  ) {
    throw new ProviderConfigError("代理提供者路径必须是配置目录内的安全相对路径");
  }
  return path;
}

function validateHttpUrl(value, label) {
  const url = trimmed(value);
  if (!url) throw new ProviderConfigError(`${label}不能为空`);
  try {
    const parsed = new URL(url);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error("protocol");
  } catch {
    throw new ProviderConfigError(`${label}必须是有效的 HTTP 或 HTTPS 地址`);
  }
  return url;
}

function normalizeProvider(input) {
  if (!input || typeof input !== "object") {
    throw new ProviderConfigError("代理提供者内容不能为空");
  }

  const name = trimmed(input.name);
  if (!name) throw new ProviderConfigError("代理提供者名称不能为空");
  if (/[\r\n]/.test(name)) throw new ProviderConfigError("代理提供者名称不能包含换行符");

  const type = trimmed(input.type) || "http";
  if (!PROVIDER_TYPES.has(type)) throw new ProviderConfigError("不支持的代理提供者类型");

  const result = {
    name,
    type,
    path: validateProviderPath(input.path, name),
    interval: positiveInteger(input.interval, 3600, "更新间隔", 60),
  };

  if (type === "http") result.url = validateHttpUrl(input.url, "订阅地址");
  const proxy = trimmed(input.proxy);
  if (proxy) result.proxy = proxy;
  const filter = trimmed(input.filter);
  if (filter) result.filter = filter;
  const excludeFilter = trimmed(input.excludeFilter);
  if (excludeFilter) result.excludeFilter = excludeFilter;

  if (input.healthCheck && typeof input.healthCheck === "object") {
    const enabled = Boolean(input.healthCheck.enable);
    result.healthCheck = {
      enable: enabled,
      url: validateHttpUrl(input.healthCheck.url || DEFAULT_HEALTH_URL, "健康检查地址"),
      interval: positiveInteger(input.healthCheck.interval, 300, "健康检查间隔", 60),
      lazy: input.healthCheck.lazy !== false,
    };
  }

  return result;
}

function providerYamlValue(provider, existing = {}) {
  const value = { ...existing };
  value.type = provider.type;
  if (provider.type === "http") value.url = provider.url;
  else delete value.url;
  value.path = provider.path;
  value.interval = provider.interval;

  for (const [inputKey, yamlKey] of [
    ["proxy", "proxy"],
    ["filter", "filter"],
    ["excludeFilter", "exclude-filter"],
  ]) {
    if (provider[inputKey]) value[yamlKey] = provider[inputKey];
    else delete value[yamlKey];
  }

  if (provider.healthCheck) {
    value["health-check"] = {
      ...(existing["health-check"] ?? {}),
      enable: provider.healthCheck.enable,
      url: provider.healthCheck.url,
      interval: provider.healthCheck.interval,
      lazy: provider.healthCheck.lazy,
    };
  } else {
    delete value["health-check"];
  }
  return value;
}

function assertUniquePath(providers, provider, ignoredName = "") {
  const wanted = provider.path.replaceAll("\\", "/");
  const owner = Object.entries(providers.toJSON()).find(([name, value]) => (
    name !== ignoredName
    && typeof value?.path === "string"
    && value.path.replaceAll("\\", "/") === wanted
  ));
  if (owner) {
    throw new ProviderConfigError(`代理提供者路径已经被“${owner[0]}”使用`, "DUPLICATE_PROVIDER_PATH");
  }
}

function updateGroupReferencesInList(groups, oldName, newName, fields = ["use"]) {
  let changed = false;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (!group || typeof group !== "object") continue;

    let nextGroup = group;
    for (const field of fields) {
      if (!Array.isArray(group[field])) continue;
      const nextValues = group[field]
        .filter((name) => name !== oldName || Boolean(newName))
        .map((name) => (name === oldName ? newName : name));
      if (nextValues.length === group[field].length && nextValues.every((name, itemIndex) => name === group[field][itemIndex])) {
        continue;
      }
      nextGroup = { ...nextGroup, [field]: nextValues };
    }

    if (nextGroup !== group) {
      groups[index] = nextGroup;
      changed = true;
    }
  }
  return changed;
}

function updateGroupReferences(document, oldName, newName) {
  const groupsNode = document.get("proxy-groups", true);
  const groups = groupsNode?.toJSON?.();
  if (!Array.isArray(groups)) return;
  if (updateGroupReferencesInList(groups, oldName, newName)) {
    document.set("proxy-groups", groups);
  }
}

function providerMap(document) {
  let providers = document.get("proxy-providers", true);
  if (providers === undefined || providers === null) {
    document.set("proxy-providers", {});
    providers = document.get("proxy-providers", true);
  }
  if (!isMap(providers)) {
    throw new ProviderConfigError("proxy-providers 必须是 YAML 映射", "INVALID_YAML");
  }
  return providers;
}

function nonNegativeInteger(value, fallback, field) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new ProviderConfigError(`${field}必须是不小于 0 的整数`);
  }
  return number;
}

function groupList(document) {
  const node = document.get("proxy-groups", true);
  if (node === undefined || node === null) return [];
  const groups = node.toJSON?.();
  if (!Array.isArray(groups)) {
    throw new ProviderConfigError("proxy-groups 必须是 YAML 列表", "INVALID_YAML");
  }
  return groups;
}

function setGroupList(document, groups) {
  document.set("proxy-groups", groups);
}

function safeNodeName(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderConfigError("节点名称不能为空", "INVALID_AUTO_GROUP");
  }
  if (/[\r\n\0]/.test(value)) {
    throw new ProviderConfigError("节点名称不能包含控制字符", "INVALID_AUTO_GROUP");
  }
  return value;
}

function escapeMihomoRegex(value) {
  return value
    .replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
    // Mihomo splits multiple filters on backticks, so keep a literal backtick
    // inside the one generated exact-match expression.
    .replaceAll("`", "\\x60");
}

function exactNodeFilter(nodes) {
  const names = [...new Set(nodes.map((node) => node.name))];
  return `^(?:${names.map(escapeMihomoRegex).join("|")})$`;
}

function providerNames(nodes) {
  return [...new Set(nodes.map((node) => node.provider))];
}

function sameStringArray(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function normalizeAutoGroup(input, providers) {
  if (!input || typeof input !== "object") {
    throw new ProviderConfigError("自定义自动组内容不能为空", "INVALID_AUTO_GROUP");
  }

  const name = trimmed(input.name);
  if (!name) throw new ProviderConfigError("自定义自动组名称不能为空", "INVALID_AUTO_GROUP");
  if (/[\r\n]/.test(name)) {
    throw new ProviderConfigError("自定义自动组名称不能包含换行符", "INVALID_AUTO_GROUP");
  }

  if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
    throw new ProviderConfigError("请至少选择一个节点", "EMPTY_AUTO_GROUP");
  }

  const nodes = [];
  const seen = new Set();
  const nodeProviders = new Map();
  for (const rawNode of input.nodes) {
    const provider = trimmed(rawNode?.provider);
    const nodeName = safeNodeName(rawNode?.name);
    if (!provider || !providers.has(provider)) {
      throw new ProviderConfigError(`节点来源提供者“${provider || "未知"}”不存在`, "AUTO_GROUP_PROVIDER_NOT_FOUND");
    }
    const nodeProvider = nodeProviders.get(nodeName);
    if (nodeProvider && nodeProvider !== provider) {
      throw new ProviderConfigError("同名节点不能同时从多个订阅中选择", "DUPLICATE_AUTO_GROUP_NODE");
    }
    nodeProviders.set(nodeName, provider);
    const key = `${provider}\0${nodeName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    nodes.push({ provider, name: nodeName });
  }

  if (nodes.length === 0) {
    throw new ProviderConfigError("请至少选择一个节点", "EMPTY_AUTO_GROUP");
  }

  return {
    name,
    url: validateHttpUrl(input.url, "测速地址"),
    interval: positiveInteger(input.interval, 300, "测速间隔", 60),
    tolerance: nonNegativeInteger(input.tolerance, 50, "延迟容差"),
    nodes,
  };
}

function autoGroupYamlValue(group) {
  return {
    name: group.name,
    type: "url-test",
    use: providerNames(group.nodes),
    filter: exactNodeFilter(group.nodes),
    url: group.url,
    interval: group.interval,
    tolerance: group.tolerance,
  };
}

function attachToProxySelector(groups, groupName) {
  const selectorIndex = groups.findIndex((group) => (
    group
    && typeof group === "object"
    && group.name === "PROXY"
    && typeof group.type === "string"
    && group.type.toLowerCase() === "select"
  ));
  if (selectorIndex < 0) {
    throw new ProviderConfigError(
      "未找到名为 PROXY 的可选代理组，无法将自定义自动组加入当前代理选择",
      "PROXY_SELECTOR_NOT_FOUND",
    );
  }

  const selector = groups[selectorIndex];
  if (selector.proxies !== undefined && !Array.isArray(selector.proxies)) {
    throw new ProviderConfigError("PROXY 代理组的 proxies 必须是 YAML 列表", "INVALID_YAML");
  }
  const proxies = selector.proxies ?? [];
  if (proxies.includes(groupName)) return;
  groups[selectorIndex] = { ...selector, proxies: [...proxies, groupName] };
}

function managedAutoGroupMatches(group, metadata) {
  if (!group || group.type !== "url-test") return false;
  const nodes = metadata?.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return false;
  return group.filter === exactNodeFilter(nodes)
    && sameStringArray(group.use, providerNames(nodes));
}

function metadataGroups(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new ProviderConfigError("自定义自动组元数据无效", "INVALID_AUTO_GROUP_METADATA");
  }
  if (metadata.version !== 1 || !metadata.groups || typeof metadata.groups !== "object" || Array.isArray(metadata.groups)) {
    throw new ProviderConfigError("自定义自动组元数据无效", "INVALID_AUTO_GROUP_METADATA");
  }
  return metadata.groups;
}

function invalidAutoGroupMetadata() {
  return new ProviderConfigError("Custom auto-group metadata is invalid", "INVALID_AUTO_GROUP_METADATA");
}

function normalizeAutoGroupMetadataNode(node) {
  const provider = trimmed(node?.provider);
  const name = typeof node?.name === "string" ? node.name : "";
  if (!provider || !name.trim() || /[\r\n\0]/.test(provider) || /[\r\n\0]/.test(name)) {
    throw invalidAutoGroupMetadata();
  }
  return { provider, name };
}

export function createAutoGroupMetadata(value = undefined) {
  if (value === undefined || value === null) return { version: 1, groups: {} };
  const groups = metadataGroups(value);
  const next = {};
  for (const [name, item] of Object.entries(groups)) {
    if (!trimmed(name) || /[\r\n\0]/.test(name) || !Array.isArray(item?.nodes) || item.nodes.length === 0) {
      throw invalidAutoGroupMetadata();
    }
    if (!item || typeof item !== "object" || !Array.isArray(item.nodes)) {
      throw new ProviderConfigError("自定义自动组元数据无效", "INVALID_AUTO_GROUP_METADATA");
    }
    next[name] = {
      nodes: item.nodes.map(normalizeAutoGroupMetadataNode),
    };
  }
  return { version: 1, groups: next };
}

export function parseManagedAutoGroups(source, metadata) {
  const document = parseYaml(source);
  const groups = groupList(document);
  const managed = metadataGroups(createAutoGroupMetadata(metadata));

  return groups.flatMap((group) => {
    if (!group || typeof group !== "object") return [];
    const item = managed[group.name];
    if (!item || !managedAutoGroupMatches(group, item)) return [];
    return [{
      name: group.name,
      url: typeof group.url === "string" ? group.url : DEFAULT_HEALTH_URL,
      interval: Number(group.interval ?? 300),
      tolerance: Number(group.tolerance ?? 50),
      nodes: item.nodes.map((node) => ({ ...node })),
    }];
  });
}

export function mutateAutoGroupYaml(source, metadata, change) {
  const document = parseYaml(source);
  const providers = providerMap(document);
  const groups = groupList(document);
  const nextMetadata = createAutoGroupMetadata(metadata);
  const managed = nextMetadata.groups;
  const originalName = trimmed(change?.originalName || change?.name);

  if (change?.action === "create") {
    const group = normalizeAutoGroup(change.group, providers);
    if (groups.some((item) => item?.name === group.name) || providers.has(group.name)) {
      throw new ProviderConfigError(`代理组“${group.name}”已经存在`, "DUPLICATE_AUTO_GROUP");
    }
    groups.push(autoGroupYamlValue(group));
    attachToProxySelector(groups, group.name);
    managed[group.name] = { nodes: group.nodes };
  } else if (change?.action === "update") {
    if (!originalName || !managed[originalName]) {
      throw new ProviderConfigError("要编辑的自定义自动组不存在", "AUTO_GROUP_NOT_FOUND");
    }
    const index = groups.findIndex((item) => item?.name === originalName);
    if (index < 0 || !managedAutoGroupMatches(groups[index], managed[originalName])) {
      throw new ProviderConfigError("自定义自动组已被手动修改，无法安全编辑", "AUTO_GROUP_CHANGED");
    }
    const group = normalizeAutoGroup(change.group, providers);
    if (group.name !== originalName && (groups.some((item) => item?.name === group.name) || providers.has(group.name))) {
      throw new ProviderConfigError(`代理组“${group.name}”已经存在`, "DUPLICATE_AUTO_GROUP");
    }
    groups[index] = autoGroupYamlValue(group);
    if (group.name !== originalName) {
      updateGroupReferencesInList(groups, originalName, group.name, ["proxies", "use"]);
    }
    attachToProxySelector(groups, group.name);
    delete managed[originalName];
    managed[group.name] = { nodes: group.nodes };
  } else if (change?.action === "delete") {
    if (!originalName || !managed[originalName]) {
      throw new ProviderConfigError("要删除的自定义自动组不存在", "AUTO_GROUP_NOT_FOUND");
    }
    const index = groups.findIndex((item) => item?.name === originalName);
    if (index < 0 || !managedAutoGroupMatches(groups[index], managed[originalName])) {
      throw new ProviderConfigError("自定义自动组已被手动修改，无法安全删除", "AUTO_GROUP_CHANGED");
    }
    groups.splice(index, 1);
    updateGroupReferencesInList(groups, originalName, "", ["proxies", "use"]);
    delete managed[originalName];
  } else if (change?.action === "attach") {
    if (!originalName || !managed[originalName]) {
      throw new ProviderConfigError("要挂载的自定义自动组不存在", "AUTO_GROUP_NOT_FOUND");
    }
    const index = groups.findIndex((item) => item?.name === originalName);
    if (index < 0 || !managedAutoGroupMatches(groups[index], managed[originalName])) {
      throw new ProviderConfigError("自定义自动组已被手动修改，无法安全挂载", "AUTO_GROUP_CHANGED");
    }
    attachToProxySelector(groups, originalName);
  } else {
    throw new ProviderConfigError("不支持的自定义自动组操作", "INVALID_AUTO_GROUP");
  }

  setGroupList(document, groups);
  return { yaml: document.toString({ lineWidth: 0 }), metadata: nextMetadata };
}

export function parseManagedProviders(source) {
  const document = parseYaml(source);
  const rawNode = document.get("proxy-providers", true);
  const raw = rawNode?.toJSON?.() ?? {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ProviderConfigError("proxy-providers 必须是 YAML 映射", "INVALID_YAML");
  }

  return Object.entries(raw).map(([name, provider]) => ({
    name,
    type: provider?.type ?? "http",
    url: provider?.url ?? "",
    path: provider?.path ?? "",
    interval: Number(provider?.interval ?? 3600),
    proxy: provider?.proxy ?? "",
    filter: provider?.filter ?? "",
    excludeFilter: provider?.["exclude-filter"] ?? "",
    healthCheck: {
      enable: Boolean(provider?.["health-check"]?.enable),
      url: provider?.["health-check"]?.url ?? DEFAULT_HEALTH_URL,
      interval: Number(provider?.["health-check"]?.interval ?? 300),
      lazy: provider?.["health-check"]?.lazy !== false,
    },
  }));
}

function configuredProviderNames(document) {
  const providers = providerMap(document).toJSON();
  return Object.keys(providers);
}

function providerNamesUsedByGroups(groups, names) {
  const configured = new Set(names);
  const used = [];
  for (const group of groups) {
    if (!Array.isArray(group?.use)) continue;
    for (const name of group.use) {
      if (configured.has(name) && !used.includes(name)) used.push(name);
    }
  }
  return used;
}

export function getSubscriptionState(source) {
  const document = parseYaml(source);
  const providers = configuredProviderNames(document);
  const activeProvider = providerNamesUsedByGroups(groupList(document), providers)[0] ?? null;
  return { providers, activeProvider };
}

export function switchSubscriptionYaml(source, selectedProvider) {
  const document = parseYaml(source);
  const providers = configuredProviderNames(document);
  const name = trimmed(selectedProvider);
  if (!providers.includes(name)) {
    throw new ProviderConfigError("所选订阅不在当前配置中", "ACTIVE_PROVIDER_NOT_FOUND");
  }

  const configured = new Set(providers);
  const groups = groupList(document);
  let changed = false;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (!Array.isArray(group?.use) || !group.use.some((item) => configured.has(item))) continue;
    const nextUse = [...new Set(group.use.map((item) => (configured.has(item) ? name : item)))];
    if (sameStringArray(group.use, nextUse)) continue;
    groups[index] = { ...group, use: nextUse };
    changed = true;
  }
  if (changed) setGroupList(document, groups);
  return document.toString({ lineWidth: 0 });
}

export function mutateProviderYaml(source, change) {
  const document = parseYaml(source);
  const providers = providerMap(document);

  if (change?.action === "create") {
    const provider = normalizeProvider(change.provider);
    if (providers.has(provider.name)) {
      throw new ProviderConfigError(`代理提供者“${provider.name}”已经存在`, "DUPLICATE_PROVIDER");
    }
    assertUniquePath(providers, provider);
    providers.set(provider.name, providerYamlValue(provider));
  } else if (change?.action === "update") {
    const originalName = trimmed(change.originalName);
    if (!originalName || !providers.has(originalName)) {
      throw new ProviderConfigError("要编辑的代理提供者不存在", "PROVIDER_NOT_FOUND");
    }
    const provider = normalizeProvider(change.provider);
    if (provider.name !== originalName && providers.has(provider.name)) {
      throw new ProviderConfigError(`代理提供者“${provider.name}”已经存在`, "DUPLICATE_PROVIDER");
    }
    assertUniquePath(providers, provider, originalName);
    const existingNode = providers.get(originalName, true);
    const existing = existingNode?.toJSON?.() ?? {};
    providers.set(provider.name, providerYamlValue(provider, existing));
    if (provider.name !== originalName) {
      providers.delete(originalName);
      updateGroupReferences(document, originalName, provider.name);
    }
  } else if (change?.action === "delete") {
    const name = trimmed(change.name);
    if (!name || !providers.has(name)) {
      throw new ProviderConfigError("要删除的代理提供者不存在", "PROVIDER_NOT_FOUND");
    }
    providers.delete(name);
    updateGroupReferences(document, name, "");
  } else {
    throw new ProviderConfigError("不支持的配置操作");
  }

  return document.toString({ lineWidth: 0 });
}
