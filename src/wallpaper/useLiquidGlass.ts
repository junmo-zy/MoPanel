import { useEffect, useRef } from "react";
import { glassDisplacement } from "./glass-displacement";

const SURFACES = ".sidebar, .page-header, .overview-header, .mobile-brand, .primary-controls, .home-card, .settings-section, .node-modal, .provider-modal, .confirm-modal, .auto-group-modal, .toast";
const SVG_NS = "http://www.w3.org/2000/svg";

export function useLiquidGlass() {
  const definitions = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = definitions.current;
    const root = svg?.parentElement;
    if (!svg || !root || typeof ResizeObserver === "undefined") return;
    // SVG backdrop displacement currently renders reliably in Chromium; other engines use the CSS glass.
    if (!/Chrome\//.test(navigator.userAgent)) return;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;
    const surfaces = new Map<HTMLElement, { filter: SVGFilterElement; size: string }>();
    let nextId = 0;

    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const surface = surfaces.get(element);
        if (!surface) continue;
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius);
        const size = `${width}/${height}/${radius}`;
        if (!width || !height || surface.size === size) continue;
        surface.size = size;
        // Cap the map resolution; it is generated only on resize, never on animation frames.
        const ratio = Math.min(1, 960 / Math.max(width, height));
        canvas.width = Math.ceil(width * ratio);
        canvas.height = Math.ceil(height * ratio);
        const pixels = context.createImageData(canvas.width, canvas.height);
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const [dx, dy] = glassDisplacement((x + 0.5) / ratio, (y + 0.5) / ratio, width, height, radius);
            const i = (y * canvas.width + x) * 4;
            pixels.data[i] = Math.round(127.5 + dx * 127.5);
            pixels.data[i + 1] = Math.round(127.5 + dy * 127.5);
            pixels.data[i + 2] = 128;
            pixels.data[i + 3] = 255;
          }
        }
        context.putImageData(pixels, 0, 0);
        const map = document.createElementNS(SVG_NS, "feImage");
        map.setAttribute("href", canvas.toDataURL());
        map.setAttribute("width", `${width}`);
        map.setAttribute("height", `${height}`);
        map.setAttribute("result", "rim");
        const lens = document.createElementNS(SVG_NS, "feDisplacementMap");
        lens.setAttribute("in", "SourceGraphic");
        lens.setAttribute("in2", "rim");
        lens.setAttribute("scale", "40");
        lens.setAttribute("xChannelSelector", "R");
        lens.setAttribute("yChannelSelector", "G");
        surface.filter.setAttribute("width", `${width}`);
        surface.filter.setAttribute("height", `${height}`);
        surface.filter.replaceChildren(map, lens);
        element.style.setProperty("--liquid-filter", `url(#${surface.filter.id})`);
        element.dataset.liquidGlass = "true";
      }
    });

    function discover() {
      for (const [element, { filter }] of surfaces) {
        if (!root!.contains(element)) {
          resize.unobserve(element);
          filter.remove();
          surfaces.delete(element);
        }
      }
      for (const element of root!.querySelectorAll<HTMLElement>(SURFACES)) {
        if (surfaces.has(element)) continue;
        const filter = document.createElementNS(SVG_NS, "filter");
        filter.id = `mopanel-glass-${nextId++}`;
        filter.setAttribute("filterUnits", "userSpaceOnUse");
        filter.setAttribute("x", "0");
        filter.setAttribute("y", "0");
        filter.setAttribute("color-interpolation-filters", "sRGB");
        svg!.append(filter);
        surfaces.set(element, { filter, size: "" });
        resize.observe(element);
      }
    }

    discover();
    const mutations = new MutationObserver((records) => {
      // Ignore text/chart updates; only page and dialog mounts need discovery.
      if (records.some((record) => [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof HTMLElement))) discover();
    });
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      resize.disconnect();
      for (const [element, { filter }] of surfaces) {
        element.style.removeProperty("--liquid-filter");
        delete element.dataset.liquidGlass;
        filter.remove();
      }
    };
  }, []);

  return definitions;
}
