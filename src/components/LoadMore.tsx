import { useEffect, useRef } from "react";

// Sentinel for batched lists: loads the next batch automatically when it comes
// near the viewport, with a button as the fallback.
export function LoadMore({ remaining, onMore, unit = "个" }: { remaining: number; onMore: () => void; unit?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMoreRef = useRef(onMore);
  useEffect(() => { onMoreRef.current = onMore; }, [onMore]);
  // Re-observe after each batch: a fresh observer reports immediately if the
  // sentinel is still near the viewport, so loading continues while scrolling.
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onMoreRef.current();
    }, { rootMargin: "400px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [remaining]);
  return (
    <div className="node-grid-more" ref={ref}>
      <button type="button" className="button button-secondary compact-button" onClick={onMore}>
        显示更多（还有 {remaining} {unit}）
      </button>
    </div>
  );
}
