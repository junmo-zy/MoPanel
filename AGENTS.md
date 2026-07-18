# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Selected direction

- Recreate the selected light “轻量驾驶舱” mock: narrow left navigation, status-first overview, rule/global/direct segmented control, current route, compact traffic panel, proxy-group rows, and a quiet configuration footer.
- Keep the interaction model familiar to Clash Verge while removing MetaCubeXD-style density.
- This is a Docker-side web panel. Do not add a misleading host “system proxy” switch.
- The configuration page must support concise Clash-Verge-style add/edit/delete flows for `proxy-providers` without a token, password, session lock, or encryption gate; preserve advanced YAML fields that the form does not expose.
- The durable visual direction is a complete macOS-style desktop window: wallpaper-backed frosted materials, SF system typography, restrained Apple control hierarchy, and user-selectable or uploaded wallpapers. Keep the existing Clash-Verge-like navigation and operational density underneath that visual language.
- Node switching uses a centered, compact modal with only a light dimming layer and no page blur; do not use a side drawer or mobile bottom sheet for this flow.
- The Docker web panel always fills the complete browser viewport. Do not restore a centered desktop-window frame, outer wallpaper margins, window radius, or outer drop shadow; keep the wallpaper visible through the full-screen glass materials instead.
- Wallpaper changes must stay visibly apparent through the full-screen glass layers; do not stack opaque page surfaces that wash the selected image out. Persist wallpaper and the independent light/dark appearance choice locally in the browser.
- When both wallpaper blur and background dim are set to zero, disable every outer glass blur and tint (window, main content, title bar, and sidebar) so the image is shown at its original clarity and color behind the usable translucent content cards.
- Put the compact light/dark toggle at the bottom-left of the desktop sidebar. It must switch the complete color system, not merely its icon, and remain reachable from the compact mobile navigation.
- Current local Docker deployment: `mihomo_lan` starts with `-f /app/config/config.yaml`, while the controller only permits reload paths under `/root/.config/mihomo`. Preserve the persistent link `/root/.config/mihomo/config.yaml -> /app/config/config.yaml` in the Mihomo config volume and use `MIHOMO_RELOAD_PATH=/root/.config/mihomo/config.yaml` for the panel.
- Node speed tests use Mihomo's group delay endpoint with a user-configured HTTP/HTTPS test URL. Place the compact “全部测速” button immediately left of the close button in the node modal, then refresh core state so URLTest/Fallback selections and all displayed node delays stay accurate.
- Custom automatic groups are native Mihomo `url-test` groups. Persist the panel-owned selection metadata beside `config.yaml` in `.mihomo-mini/auto-groups.json`, and generate `use` plus an exact anchored `filter` from the selected provider/node pairs; do not clone subscriptions. New and edited groups must be included in the `PROXY` selector, and legacy managed groups need an idempotent attach action before they can be used.
- Keep candidate identity as the `(provider, node name)` pair. Reject duplicate node names across selected providers, and block a provider rename/delete while any panel-managed automatic group references it. Treat `URLTest` groups as automatic in the node modal: allow viewing and speed tests, but not manual fixed-node selection.
- The overview's active route must derive from the effective selector: `PROXY` in rule mode, `GLOBAL` in global mode, and `DIRECT` in direct mode. Surface the selected child group near the top of the summary rather than assuming the first returned group is active.
- Keep the product vocabulary proxy-first, following Clash Verge's mental model: use `当前代理`, `代理组`, `节点`, and `代理模式`; do not rename the proxy experience into a route page, route workbench, or route chain. The Apple/wallpaper visual style remains, but the operating hierarchy should be Clash-Verge-like: overview status, proxy groups and node selection, subscriptions/configuration, then diagnostics.
- The user finds the current operating logic unintuitive. Prioritize one explained route-control mental model that clearly separates traffic mode, chosen proxy group, automatic node selection, and testing; do not make users infer these relationships from raw Mihomo group names alone.
- Brand the Docker-side application and its browser title as `MoPanel`; use `mopanel` for the panel container/image, while leaving the running `mihomo_lan` proxy core untouched. Keep the existing `.mihomo-mini` metadata path for backward compatibility until an explicit migration is implemented.
