import type { PageSwipe } from "@t3-ardia/entry";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import { ardiaAvailable, loadArdia } from "../ardia/ardiaHostStore";

const SIZE = 40;
const INSET = 16;

/**
 * The arrow that follows a two-finger swipe on a page, as Arc and Safari show
 * it: it slides in from the edge and fills once letting go would go back or
 * forward. Faint when there's nowhere to go.
 */
export function PageSwipeIndicator() {
  const [swipe, setSwipe] = useState<PageSwipe | null>(null);

  useEffect(() => {
    if (!ardiaAvailable) return;
    let stop: (() => void) | null = null;
    let stopped = false;
    let clear: ReturnType<typeof setTimeout> | undefined;
    void loadArdia().then((module) => {
      if (stopped) return;
      stop = module.onPageSwipe((next) => {
        clearTimeout(clear);
        setSwipe(next);
        if (next.phase === "ended" || next.phase === "cancelled") {
          clear = setTimeout(() => setSwipe(null), 180);
        }
      });
    });
    return () => {
      stopped = true;
      clearTimeout(clear);
      stop?.();
    };
  }, []);

  if (!swipe) return null;
  const done = swipe.phase === "ended" || swipe.phase === "cancelled";
  const progress = Math.min(1, swipe.progress);
  const committed = swipe.action !== null && swipe.progress >= 1;
  const left = swipe.side === "left";
  const travel = (SIZE + INSET) * (swipe.action ? progress : progress * 0.4);
  const Icon = left ? ChevronLeftIcon : ChevronRightIcon;

  // Clipped to the page, so it slides in from the page's own edge.
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 overflow-hidden"
      style={{
        left: swipe.rect.left,
        top: swipe.rect.top,
        width: swipe.rect.width,
        height: swipe.rect.height,
      }}
    >
      <div
        style={{
          top: swipe.rect.height / 2 - SIZE / 2,
          [left ? "left" : "right"]: travel - SIZE,
          width: SIZE,
          height: SIZE,
          opacity: done ? 0 : swipe.action ? 0.5 + 0.5 * progress : 0.4,
        }}
        className={cn(
          "absolute grid place-items-center rounded-full shadow-lg transition-[background-color,color,transform,opacity] duration-150",
          committed
            ? "scale-110 bg-foreground text-background"
            : "bg-popover text-foreground ring-1 ring-border ring-inset",
        )}
      >
        <Icon className="size-5" />
      </div>
    </div>
  );
}
