import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";
import { switchSpaceAnimated, useBrowserModel } from "../../../browser/rome/browserStore";

// How far a sideways two-finger swipe travels before it changes space.
const SWIPE_DISTANCE = 80;

/** One dot per space; click one, or swipe sideways over the sidebar, to change space. */
export function SpaceDots() {
  const spaces = useBrowserModel((state) => state.browser?.spaces ?? null);
  const spaceId = useBrowserModel((state) => state.browser?.spaceId ?? null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sidebar = root.current?.closest<HTMLElement>('[data-slot="sidebar-inner"]');
    if (!sidebar) return;
    let travelled = 0;
    let settleTimer = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      travelled += event.deltaX;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => (travelled = 0), 180);
      if (Math.abs(travelled) < SWIPE_DISTANCE) return;
      const model = useBrowserModel.getState().browser;
      const direction = travelled > 0 ? 1 : -1;
      travelled = 0;
      if (!model) return;
      const index = model.spaces.findIndex((space) => space.id === model.spaceId);
      const next = model.spaces[index + direction];
      if (next) switchSpaceAnimated(next.id);
    };
    sidebar.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.clearTimeout(settleTimer);
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
