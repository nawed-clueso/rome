import { createPortal } from "react-dom";

import { useFolderDrag } from "./folderDrag";

/** The row being dragged, under the pointer, and where it would land. */
export function FolderDragLayer() {
  const drag = useFolderDrag();
  if (!drag) return null;
  const { drop, rect } = drag;
  let indicator = null;
  if (drop && rect) {
    if (drop.kind === "before" || drop.kind === "after") {
      indicator = (
        <div
          style={{
            left: rect.left + 4,
            width: rect.width - 8,
            top: (drop.kind === "before" ? rect.top : rect.bottom) - 1,
          }}
          className="fixed h-0.5 rounded-full bg-(--space-accent,var(--foreground))"
        />
      );
    } else if (drop.kind !== "tiles") {
      // The tiles show a drop among them themselves, by making room.
      indicator = (
        <div
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          className="fixed rounded-lg bg-sidebar-foreground/[0.06] ring-1 ring-(--space-accent,var(--foreground)) ring-inset"
        />
      );
    }
  }
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70]">
      {indicator}
      <div
        style={{ transform: `translate(${drag.x + 12}px, ${drag.y + 10}px)` }}
        className="fixed top-0 left-0 max-w-56 truncate rounded-lg border border-border bg-popover px-2.5 py-1 text-popover-foreground text-xs shadow-lg"
      >
        {drag.title}
      </div>
    </div>,
    document.body,
  );
}
