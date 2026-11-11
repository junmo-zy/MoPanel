import { useEffect, useRef, useState } from "react";

// One app-wide hover tip for anything with data-tip="…" (icon buttons, badges,
// truncated names). Faster and better looking than the browser's title bubble,
// and it also works on keyboard focus. Elements marked data-tip-auto only show
// their tip when their text is cut off or their label is visually hidden
// (e.g. sidebar items when the sidebar collapses to icons).

const SHOW_DELAY_MS = 300;
const WARM_WINDOW_MS = 600;
const GAP = 8;

interface Tip {
  text: string;
  left: number;
  top: number;
  placement: "top" | "bottom";
}

function shouldShow(element: HTMLElement) {
  if (!element.dataset.tip) return false;
  if (!("tipAuto" in element.dataset)) return true;
  if (element.scrollWidth > element.clientWidth + 1) return true;
  const label = element.querySelector<HTMLElement>("[data-tip-label]");
  return Boolean(label && label.getBoundingClientRect().width <= 1);
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const lastHidden = useRef(0);

  useEffect(() => {
    function place(element: HTMLElement) {
      const rect = element.getBoundingClientRect();
      const above = rect.top > 44;
      setTip({
        text: element.dataset.tip || "",
        left: rect.left + rect.width / 2,
        top: above ? rect.top - GAP : rect.bottom + GAP,
        placement: above ? "top" : "bottom",
      });
    }

    function hide() {
      window.clearTimeout(timer.current);
      if (target.current) lastHidden.current = Date.now();
      target.current = null;
      setTip(null);
    }

    function show(element: HTMLElement) {
      if (target.current === element) return;
      window.clearTimeout(timer.current);
      target.current = element;
      const warm = Date.now() - lastHidden.current < WARM_WINDOW_MS;
      timer.current = window.setTimeout(() => {
        if (target.current === element && element.isConnected && shouldShow(element)) place(element);
      }, warm ? 0 : SHOW_DELAY_MS);
    }

    function onOver(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      const element = (event.target as Element | null)?.closest<HTMLElement>("[data-tip]");
      if (element) show(element);
      else if (target.current) hide();
    }

    function onOut(event: PointerEvent) {
      const next = event.relatedTarget as Node | null;
      if (target.current && (!next || !target.current.contains(next))) hide();
    }

    function onFocus(event: FocusEvent) {
      const element = (event.target as Element | null)?.closest<HTMLElement>("[data-tip]");
      if (element && (element as HTMLElement).matches(":focus-visible")) show(element);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") hide();
    }

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  // Keep the bubble inside the window once its width is known.
  useEffect(() => {
    const element = bubble.current;
    if (!element || !tip) return;
    const width = element.offsetWidth;
    const left = Math.min(Math.max(tip.left - width / 2, 8), window.innerWidth - width - 8);
    element.style.left = `${left}px`;
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={bubble}
      className="tooltip-bubble"
      role="tooltip"
      data-placement={tip.placement}
      style={{ left: tip.left, top: tip.top }}
    >
      {tip.text}
    </div>
  );
}
