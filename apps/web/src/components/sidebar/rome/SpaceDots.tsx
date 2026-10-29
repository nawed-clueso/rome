import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";
import {
  dragSpace,
  isSwitchingSpace,
  settleSpaceDrag,
  switchSpaceAnimated,
  useBrowserModel,
} from "../../../browser/rome/browserStore";

// How far a sideways two-finger swipe travels before it changes space.
const SWIPE_DISTANCE = 80;
// Quiet after the last wheel event that ends a swipe.
const SETTLE_MS = 180;
// After a change the trackpad coasts for a second or so, slowing all the way. Fingers
// landing again show as movement this many times the slowest coasting so far, and at
// least this much more (a coasting step sometimes arrives as two at once).
const PICK_UP_FACTOR = 2.5;
const PICK_UP_PIXELS = 4;
// Swipe decisions kept for diagnosis (window.__romeSwipe in the dev tools).
const TRACE_LIMIT = 800;

/**
 * Sideways travel since the swipe began, and whether it already changed space (then
 * its coasting is ignored). Kept outside the component, which the sidebar remounts
 * as the space changes mid-swipe.
 */
const swipe = {
  travelled: 0,
  spent: false,
  slowest: Number.POSITIVE_INFINITY,
  sign: 0,
  settleTimer: 0,
  frame: 0,
  lastChangeAt: 0,
};

type TraceEntry = {
  readonly t: number;
  readonly dx: number;
  readonly dy: number;
  readonly what: string;
  readonly travelled: number;
};
const trace: TraceEntry[] = [];
const note = (what: string, event?: WheelEvent) => {
  trace.push({
    t: Math.round(performance.now()),
    dx: event ? Math.round(event.deltaX * 10) / 10 : 0,
    dy: event ? Math.round(event.deltaY * 10) / 10 : 0,
    what,
    travelled: Math.round(swipe.travelled),
  });
  if (trace.length > TRACE_LIMIT) trace.splice(0, trace.length - TRACE_LIMIT);
};
if (typeof window !== "undefined") {
  (window as unknown as { __romeSwipe: unknown }).__romeSwipe = {
    trace,
    /** The last `count` entries, oldest first. */
    tail: (count = 120) => trace.slice(-count),
  };
}

/** One dot per space; click one, or swipe sideways over the sidebar, to change space. */
export function SpaceDots() {
  const spaces = useBrowserModel((state) => state.browser?.spaces ?? null);
  const spaceId = useBrowserModel((state) => state.browser?.spaceId ?? null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sidebar = root.current?.closest<HTMLElement>('[data-slot="sidebar-inner"]');
    if (!sidebar) return;

    const gesture = swipe;
    const neighbour = (direction: 1 | -1) => {
      const model = useBrowserModel.getState().browser;
      if (!model) return null;
      const index = model.spaces.findIndex((space) => space.id === model.spaceId);
      return model.spaces[index + direction] ?? null;
    };
    const settle = () => {
      window.cancelAnimationFrame(gesture.frame);
      if (gesture.travelled !== 0) {
        note("spring-back");
        settleSpaceDrag(-gesture.travelled);
      }
      note("quiet");
      gesture.travelled = 0;
      gesture.spent = false;
      gesture.slowest = Number.POSITIVE_INFINITY;
    };

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
        note("vertical", event);
        return;
      }
      window.clearTimeout(gesture.settleTimer);
      gesture.settleTimer = window.setTimeout(settle, SETTLE_MS);
      const size = Math.abs(event.deltaX);
      const sign = Math.sign(event.deltaX);
      if (gesture.spent) {
        // While the change still slides in, nothing counts: nobody means to cross two
        // spaces in under a third of a second.
        if (isSwitchingSpace()) {
          if (sign) gesture.sign = sign;
          note("sliding", event);
          return;
        }
        // Coasting never turns back and never speeds up; fingers landing again do.
        const turned = gesture.sign !== 0 && sign !== 0 && sign !== gesture.sign;
        const pickedUp =
          size >= Math.max(gesture.slowest * PICK_UP_FACTOR, gesture.slowest + PICK_UP_PIXELS);
        if (size > 0) gesture.slowest = Math.min(gesture.slowest, size);
        if (sign) gesture.sign = sign;
        if (!turned && !pickedUp) {
          note("coasting", event);
          return;
        }
        note(turned ? "new-swipe:turned" : "new-swipe:picked-up", event);
        gesture.spent = false;
        gesture.travelled = 0;
      }
      if (sign) gesture.sign = sign;
      gesture.travelled += event.deltaX;
      const direction = gesture.travelled > 0 ? 1 : -1;
      const next = neighbour(direction);
      // Toward the first or last space's empty side, nothing moves or builds up.
      if (!next) {
        gesture.travelled = 0;
        note("edge", event);
        return;
      }
      if (Math.abs(gesture.travelled) < SWIPE_DISTANCE) {
        note("drag", event);
        // One move per frame however fast the events come.
        window.cancelAnimationFrame(gesture.frame);
        gesture.frame = window.requestAnimationFrame(() => dragSpace(-gesture.travelled));
        return;
      }
      const offset = -gesture.travelled;
      gesture.travelled = 0;
      gesture.spent = true;
      gesture.slowest = Number.POSITIVE_INFINITY;
      window.cancelAnimationFrame(gesture.frame);
      const now = performance.now();
      const since = gesture.lastChangeAt ? Math.round(now - gesture.lastChangeAt) : null;
      gesture.lastChangeAt = now;
      note(`change->${next.name}`, event);
      // Two changes this close together are what this log is for.
      if (since !== null && since < 900) {
        console.warn("[rome:swipe] changed space twice in", since, "ms", trace.slice(-80));
      } else {
        console.info("[rome:swipe] changed space", { to: next.name, since });
      }
      switchSpaceAnimated(next.id, offset);
    };
    sidebar.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      sidebar.removeEventListener("wheel", onWheel);
    };
  }, []);

  if (!spaces || spaces.length < 2) return <div ref={root} className="flex-1" />;
  return (
    <div ref={root} className="flex flex-1 items-center justify-center gap-1">
      {spaces.map((space) => (
        <button
          key={space.id}
          type="button"
          title={space.name}
          aria-label={`Switch to ${space.name}`}
          aria-current={space.id === spaceId ? "true" : undefined}
          onClick={() => switchSpaceAnimated(space.id)}
          className="grid size-4 cursor-pointer place-items-center rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors",
              space.id === spaceId ? "" : "bg-sidebar-muted-foreground/40",
            )}
            style={space.id === spaceId ? { background: space.accent } : undefined}
          />
        </button>
      ))}
    </div>
  );
}
