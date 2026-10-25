import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useRef } from "react";

import { cn } from "~/lib/utils";
import {
  placeInRows,
  type SplitGroup,
  type SplitPlacement,
  type SplitSide,
  splitGroupOf,
  splitTabKey,
  useSplitViewStore,
} from "../../splitViewStore";
import {
  currentThreadContextDragGhost,
  TAB_DROP_EVENT,
  THREAD_CONTEXT_DROP_EVENT,
  threadContextDropTargetProps,
  useThreadContextDrop,
  useThreadContextDragGhost,
} from "../chat/threadContextDrag";
import { ChatBesidePicker } from "./ChatBesidePicker";
import { contains, layoutSplit, type Rect, rectOf } from "./splitGeometry";

const NO_ENVIRONMENT = "split" as EnvironmentId;
// Stands in for the dragged chat while the new layout is worked out.
const INCOMING = "\0incoming";

const SIDE_LABEL: Record<SplitSide, string> = {
  left: "Left",
  right: "Right",
  top: "Above",
  bottom: "Below",
};

type Preview =
  | { readonly kind: "context"; readonly rect: Rect; readonly element: HTMLElement }
  | {
      readonly kind: "split";
      readonly placement: SplitPlacement;
      readonly rect: Rect;
      readonly others: readonly Rect[];
    }
  | { readonly kind: "full"; readonly rect: Rect }
  | null;

/** The panes on screen now, by thread key, and the area they share. */
function measurePanes(mainKey: string, open: boolean) {
  const panes = new Map<string, Rect>();
  if (open) {
    for (const element of document.querySelectorAll<HTMLElement>("[data-split-pane]")) {
      panes.set(element.dataset.splitPane!, rectOf(element));
    }
    const grid = document.querySelector("[data-split-grid]");
    return { panes, area: grid ? rectOf(grid) : null };
  }
  const main = document.querySelector('[data-slot="sidebar-inset"]:not([data-split])');
  if (!main) return { panes, area: null };
  const area = rectOf(main);
  panes.set(mainKey, area);
  return { panes, area };
}

/**
 * What dropping at `point` would do. Over a composer a chat goes in as context (a
 * tab can't);
 * elsewhere it splits the pane under the pointer, on the side whose edge is
 * nearest, skipping sides that are full; the preview is the exact rectangle the
 * chat would get in the new layout.
 */
function previewAt(
  point: { x: number; y: number },
  mainKey: string,
  group: SplitGroup | null,
  columnWeights: Readonly<Record<string, number>>,
  rowWeights: readonly number[] | undefined,
  tab: boolean,
): Preview {
  for (const element of tab
    ? []
    : document.querySelectorAll<HTMLElement>("[data-thread-context-drop]")) {
    if (element.closest("[data-split-drop-zone]")) continue;
    const rect = rectOf(element);
    if (rect.width > 0 && contains(rect, point)) return { kind: "context", rect, element };
  }
  const { panes, area } = measurePanes(mainKey, group !== null);
  if (!area || panes.size === 0) return null;
  let target: string | null = null;
  let targetRect: Rect | null = null;
  let nearest = Number.POSITIVE_INFINITY;
  for (const [key, rect] of panes) {
    const cx = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
    const cy = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
    const distance = Math.hypot(point.x - cx, point.y - cy);
    if (distance < nearest) {
      nearest = distance;
      target = key;
      targetRect = rect;
    }
  }
  if (!target || !targetRect) return null;
  const rows = group?.rows ?? [[mainKey]];
  const fx = (point.x - targetRect.x) / targetRect.width;
  const fy = (point.y - targetRect.y) / targetRect.height;
  const sides = (
    [
      ["left", fx],
      ["right", 1 - fx],
      ["top", fy],
      ["bottom", 1 - fy],
    ] as const
  ).toSorted((a, b) => a[1] - b[1]);
  for (const [side] of sides) {
    const placement = { target, side };
    const next = placeInRows(rows, INCOMING, placement);
    if (!next) continue;
    const rowIndex = next.findIndex((row) => row.includes(INCOMING));
    const newRow = next.length > rows.length;
    // The newcomer takes an even share; rows keep their sizes where they can.
    const nextRowWeights = newRow
      ? side === "top"
        ? [1, ...rows.map((_, index) => rowWeights?.[index] ?? 1)]
        : [...rows.map((_, index) => rowWeights?.[index] ?? 1), 1]
      : rowWeights;
    const row = next[rowIndex]!;
    const shared = row.filter((key) => key !== INCOMING).map((key) => columnWeights[key] ?? 1);
    const average = shared.length
      ? shared.reduce((sum, weight) => sum + weight, 0) / shared.length
      : 1;
    const layout = layoutSplit(
      next,
      { ...columnWeights, [INCOMING]: average },
      nextRowWeights,
      area,
    );
    const rect = layout.get(INCOMING)!;
    const others = [...layout].filter(([key]) => key !== INCOMING).map(([, other]) => other);
    return { kind: "split", placement, rect, others };
  }
  return { kind: "full", rect: targetRect };
}

const boxStyle = (rect: Rect) => ({
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
});

/** The whole content area while a chat is dragged out of the sidebar, showing where it will land. */
function SplitDropZone({ mainKey }: { mainKey: string }) {
  const ghost = useThreadContextDragGhost();
  const zone = useRef<HTMLDivElement | null>(null);
  const group = useSplitViewStore((state) => splitGroupOf(state.groups, mainKey));
  const columnWeights = useSplitViewStore((state) => state.columnWeights);
  const rowWeights = useSplitViewStore((state) => (group ? state.rowWeights[group.id] : undefined));
  const place = useSplitViewStore((state) => state.place);

  useThreadContextDrop(zone, NO_ENVIRONMENT, "split-zone", (refs) => {
    const point = currentThreadContextDragGhost();
    if (!point) return;
    const preview = previewAt(point, mainKey, group, columnWeights, rowWeights, false);
    if (preview?.kind === "context") {
      preview.element.dispatchEvent(new CustomEvent(THREAD_CONTEXT_DROP_EVENT, { detail: refs }));
    } else if (preview?.kind === "split" && refs[0]) {
      place(mainKey, scopedThreadKey(refs[0]), preview.placement);
    }
  });

  // A browser tab dropped here joins the split the same way a chat does.
  const dropTab = useEffectEvent((tabId: string) => {
    const point = currentThreadContextDragGhost();
    if (!point) return;
    const preview = previewAt(point, mainKey, group, columnWeights, rowWeights, true);
    if (preview?.kind === "split") place(mainKey, splitTabKey(tabId), preview.placement);
  });
  useEffect(() => {
    const element = zone.current;
    if (!element) return;
    const listener = (event: Event) => dropTab((event as CustomEvent<string>).detail);
    element.addEventListener(TAB_DROP_EVENT, listener);
    return () => element.removeEventListener(TAB_DROP_EVENT, listener);
  }, []);

  const preview = ghost
    ? previewAt(ghost, mainKey, group, columnWeights, rowWeights, !!ghost.tabId)
    : null;
  return (
    <div
      ref={zone}
      data-split-drop-zone=""
      {...threadContextDropTargetProps()}
      aria-hidden
      style={{ display: ghost === null ? "none" : undefined }}
      className="pointer-events-auto fixed inset-0 z-[60]"
    >
      {preview?.kind === "split" ? (
        <>
          {preview.others.map((rect, index) => (
            <div
              key={index}
              style={boxStyle(rect)}
              className="pointer-events-none fixed rounded-xl border border-foreground/25 border-dashed bg-background/30 transition-all duration-150 ease-out"
            />
          ))}
          <div
            style={boxStyle(preview.rect)}
            className="pointer-events-none fixed grid place-items-center rounded-xl border-2 border-foreground/50 bg-foreground/[0.07] shadow-lg backdrop-blur-[1px] transition-all duration-150 ease-out"
          >
            <span className="font-label rounded-lg bg-foreground px-2.5 py-1 text-[11px] text-background uppercase tracking-[0.06em]">
              {SIDE_LABEL[preview.placement.side]}
            </span>
          </div>
        </>
      ) : null}
      {preview?.kind === "context" || preview?.kind === "full" ? (
        <div
          style={boxStyle(preview.rect)}
          className={cn(
            "pointer-events-none fixed grid place-items-center rounded-xl border-2 border-dashed transition-all duration-150 ease-out",
            preview.kind === "context"
              ? "border-foreground/40 bg-foreground/[0.04]"
              : "border-destructive/50 bg-destructive/5",
          )}
        >
          <span className="font-label rounded-lg bg-foreground px-2.5 py-1 text-[11px] text-background uppercase tracking-[0.06em]">
            {preview.kind === "context"
              ? (preview.element.dataset.dropLabel ?? "Add as context")
              : "Split is full"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** The drop target for building splits, and the picker for the panel's Chat action. */
export function SplitPanes(props: { readonly primaryThreadKey: string | null }) {
  return (
    <>
      {props.primaryThreadKey ? <SplitDropZone mainKey={props.primaryThreadKey} /> : null}
      <ChatBesidePicker />
    </>
  );
}
