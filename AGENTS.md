# MoPanel — notes for agents

MoPanel is a Docker-side web panel for a running Mihomo core: Clash-Verge-like operation, Apple-style visuals. This file records durable decisions; keep it current (replace outdated rules instead of appending new "rounds").

Run the panel and a real Mihomo core yourself to verify changes (see "Verification"); don't hand the user server-start instructions you can run.

## Deployment (user's NAS)

- Canonical source: `/vol2/1000/NAS-SSD/mopanel` (Mac SMB mount `/Volumes/NAS-SSD/mopanel`). The HDD copy is an archive.
- Container `mopanel`, LAN page `http://192.168.1.5:1224`, runtime UID/GID `1000:1000`.
- Core container `mihomo` on external network `mihomo_default`, API `http://mihomo:9090`. Shared config directory `/vol2/1000/NAS-SSD/Mihomo/config`, mounted at `/config` in both containers; `MIHOMO_RELOAD_PATH=/config/config.yaml`. Panel metadata lives in `/config/.mihomo-mini/` (keep that name for backward compatibility).
- `.env` holds the core API secret: never commit or print it. `compose.yaml` runs the image; `compose.build.yaml` adds the source build. Rebuild with `docker compose -f compose.yaml -f compose.build.yaml up -d --build`; never recreate the Mihomo core while deploying the panel.
- Unlock tests, site latency and exit IP connect to Mihomo's mixed-port from the panel container, so the core needs `allow-lan: true` (or set `MIHOMO_PROXY_URL`).
- Image archives (`*.tar`) and design notes are not part of the project; they are git/docker-ignored and should not accumulate in the source folder.

## Product rules

- Docker-side panel: no host "system proxy" switch. No login/token gate for config edits; it is meant for a trusted LAN.
- Vocabulary follows Clash Verge: 当前代理, 代理组, 节点, 代理模式, 订阅. Don't rename the proxy experience into "routes".
- Navigation (desktop sidebar and mobile tab bar): 概览, 代理, 订阅, 连接, 规则, 日志, 测试, 设置.
- With a real controller never show demo nodes/traffic/logs; show a disconnected state and keep polling. Demo data only exists for the built-in demo client.
- Mode, allow-lan, ipv6 and mixed-port go through `PATCH /api/config/core`: applied to the running core and written to config.yaml. Every panel-triggered reload re-applies runtime mode/allow-lan/ipv6. Settings save only sends changed fields.
- Errors from save/delete actions render inside the open dialog, not behind it. Config writes resolve symlinks, keep the file mode, and are rolled back if Mihomo rejects the reload.

## Visual design (Apple frosted glass)

- The panel fills the whole browser viewport. No fake window frame, traffic-light dots or full-width title bar. The brand mark (warm-white line-art cat on navy, `public/brand/mopanel-cat.png`, also favicon/touch icon), `MoPanel` and the connection status sit at the top of the floating sidebar; when the sidebar is icon-only the status is a dot on the cat; phones show a light brand row with a status pill.
- Two material layers, as in Apple's design: the navigation layer (floating sidebar, page-title toolbar, mobile tab bar, dialogs, toast) is translucent glass (32 px blur; saturate 150 % light / 180 % dark; hairline grey edge, soft top highlight — no glowing white rims). The content layer (cards, lists) uses near-opaque grouped surfaces (white in light, #1C1C1E-like in dark).
- The user picks one of four material levels 超薄/轻薄/标准/浓厚 (stored as `glass` 25/45/65/85, snapped on client and server); `--nav-alpha` / `--content-alpha` derive from it. Never offer a free opacity slider: low tint made text unreadable.
- Wallpaper: blurred (0–60 px) and veiled (0–90 %, black in dark / white in light) only by the user's settings; no window-wide backdrop blur. Built-in wallpapers can be removed and restored (`hidden`), at least one wallpaper always remains, an empty list falls back to a gradient. Wallpaper choice, custom image, blur, veil and glass level are shared via `.mihomo-mini`; light/dark is per browser. Wallpaper preferences are validated identically in `src/wallpaper/wallpaper-preferences.ts` and `server/panel-settings.mjs`.
- Page titles sit in their own glass toolbar; never put bare text on the wallpaper.
- Every icon-only control has a `data-tip` that says what it does; `TooltipLayer` shows it after ~0.3 s. Use `data-tip-auto` for labels that only need a tip when truncated or collapsed.
- Check visual changes in light and dark, at the material extremes, on a bright and a dark wallpaper, before calling them done.

## Pages

- 概览: status chip, mode + current proxy (live delay, 更换代理 opens the centered node dialog, 测速), 流量统计 (one chart + speeds, totals, connections, memory), 出口 IP (looked up through the proxy, maskable), 当前订阅 (usage, expiry, update), 内核信息 (static facts). No duplicated speed panels or group lists.
- 代理 (Clash Verge proxy page): mode control in the toolbar; collapsible group cards (icon or monogram, type, current chain to the leaf node, delay; tools: locate, test group, per-group sort, search, count, collapse; custom auto groups add use/edit/delete); node cards in a responsive grid — click to select, click the delay to test one node. URLTest/Fallback/LoadBalance are view-only. Rule mode hides GLOBAL, global mode lists it first; group order is config order (Mihomo's `default` provider). Large groups render in batches of 120; don't use `content-visibility` on node cards (locate lands off-screen).
- 订阅: one card per subscription — click to switch; type, node count, host only (never the URL, it carries a token), update time, usage bar and expiry when Mihomo reports `subscriptionInfo` (only after a real download), whether groups/rules come from the subscription; actions update/edit/delete.
- 连接: `/connections?interval=1000` WebSocket, per-connection speed from snapshot deltas, closed history, list/table views, sort, details, confirm before 全部关闭.
- 规则: rules in match order with RULE-SET sizes, rule source banner (subscription or local) with 「从订阅同步」, search, batched rendering, 规则集合 dialog.
- 日志: stream kept in App (survives page switches), level filter (调试 switches the stream to debug), keyword highlight, pause/resume.
- 测试: 解锁测试 (12 services, server-side in `server/unlock-checks.mjs`, through Mihomo's proxy port; each check fails soft to 检测失败 with a reason; calibrate against real services before changing a heuristic) and 网站延迟 (defaults + user sites). Flag emoji only when the browser can render them.
- 设置: appearance (wallpapers, blur, veil, material level), network, speed-test URL.

## Proxy, subscription and rule behaviour

- Mihomo's `Compatible` providers (one per group, plus `default`) are virtual: never show them as subscriptions or as a node's provider. A group's delay is its leaf node's delay.
- Subscriptions are full profiles, like Clash Verge (`server/profile-sync.mjs`): on switch, update, manual sync, 8 s after panel start and every 6 h, the server downloads the link (UA `clash-verge/v2.2.3 mihomo/1.19`, direct first, then through Mihomo). If it contains `proxy-groups` + `rules`, its groups, rules and rule-providers are used. Nodes still come from the panel's proxy-provider for that link: explicit node lists become `use: [provider]` (+ exact `filter` for partial lists), `include-all-proxies` becomes `use`; rules targeting nodes or missing groups are pointed at the main selector and counted.
- Base settings always come from config.yaml (ports, LAN, controller, secret, mode, TUN…); profile `dns`/`hosts`/`sniffer`/`geox-url`… are added only when config.yaml lacks them (dns `listen` dropped) and removed again on switching away (tracked in `.mihomo-mini/profile-state.json`).
- The user's own groups/rules are saved to `.mihomo-mini/local-rules.json` before a profile replaces them and restored for node-only subscriptions. The last downloaded profile is cached in `.mihomo-mini/profiles/` and used, with a warning, when the link is unreachable. Background syncs never rewrite a local-rules config; Mihomo is reloaded only when the generated config changes.
- Custom auto groups are native `url-test` groups with metadata in `.mihomo-mini/auto-groups.json`; candidates are `(provider, node)` pairs turned into `use` + exact `filter`. They survive every switch and join the main selector (PROXY, else the first select group). A provider referenced by one cannot be renamed or deleted. Subscription switching never rewrites them.
- Deleting a provider moves its groups to the next provider, or DIRECT when none is left, so a reload never fails on an empty group.

## Speed tests

- Port of Clash Verge's DelayManager (`src/hooks/useDelayTester.ts`): each node individually (provider nodes via `/providers/proxies/<p>/<n>/healthcheck`, others via `/proxies/<n>/delay`), 10 in parallel, random 0–200 ms stagger, ≥ 500 ms visible per test, 10 s timeout, the group's own `testUrl` when it has one, results cached 30 min. Don't use Mihomo's whole-group delay endpoint (no progress until all nodes finish).
- Colours: green < 250 ms, blue < 400 ms, orange above, red 超时. Sort by delay ranks measured, timeout, untested, and waits until a batch finishes.
- Animation: three bouncing dots per node, a light sweep over cards under test, results pop in, progress bar and "测速中 x/y".

## Verification

- `npm run lint`, `npx tsc -b`, `npm test`, `npm run build` must pass.
- End-to-end: run a real `mihomo` binary (file/HTTP providers pointing at a second local mihomo as SOCKS backend, a slow local 204 server — mihomo treats 0 ms as failure — and a local HTTP server for subscriptions/profiles/rule sets), start `node server/index.mjs` against it, and drive the built panel with Playwright, taking screenshots.
- Gotchas: mihomo doesn't log loopback connections (use an external host); the sandbox sets `no_proxy` for 127.0.0.1 (`curl --noproxy ''`); run each E2E suite in its own shell call (a core restarted inside a suite can survive into the next); never put a `pkill -f` pattern in the same command that writes the script containing it; SMB keeps deleted open files as `.smbdelete*` until the share is reconnected.
