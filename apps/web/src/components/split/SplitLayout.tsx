import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import { Fragment, type PointerEvent as ReactPointerEvent } from "react";

import { cn } from "~/lib/utils";
import { type SplitGroup, splitTabId, useSplitViewStore } from "../../splitViewStore";
import { useThreadShell } from "../../state/entities";
import ChatView from "../ChatView";
import { SidebarInset } from "../ui/sidebar";
import { MIN_PANE_SIZE, SPLIT_GAP } from "./splitGeometry";
import { TabPane } from "./TabPane";

const weightOr = (value: number | undefined) => (value && value > 0 ? value : 1);

/**
 * Follows a drag on a handle between two panes (or rows) and reports the share
 * the first one should now have of their combined size.
 */
function dragBetween(
  event: ReactPointerEvent<HTMLDivElement>,
  axis: "x" | "y",
  onShare: (share: number) => void,
) {
  const handle = event.currentTarget;
  const before = handle.previousElementSibling;
  const after = handle.nextElementSibling;
  if (event.button !== 0 || !before || !after) return;
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  const size = (element: Element) =>
    axis === "x" ? element.getBoundingClientRect().width : element.getBoundingClientRect().height;
  const start = axis === "x" ? event.clientX : event.clientY;
  const first = size(before);
  const total = first + size(after);
  const move = (moveEvent: PointerEvent) => {
    const now = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
    const next = Math.min(total - MIN_PANE_SIZE, Math.max(MIN_PANE_SIZE, first + now - start));
    onShare(next / total);
  };
  const end = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    document.body.style.removeProperty("cursor");
  };
  document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

function Handle(props: {
  readonly axis: "x" | "y";
  readonly onDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onReset: () => void;
}) {
  const vertical = props.axis === "x";
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={vertical ? "Resize chats" : "Resize rows"}
      onPointerDown={props.onDrag}
      onDoubleClick={props.onReset}
      style={vertical ? { width: SPLIT_GAP } : { height: SPLIT_GAP }}
      className={cn(
        "group/resize flex shrink-0 items-center justify-center",
        vertical ? "cursor-col-resize" : "cursor-row-resize",
      )}
    >
      <span
        className={cn(
          "rounded-full bg-foreground/0 transition-colors group-hover/resize:bg-foreground/30 group-active/resize:bg-foreground/50",
          vertical ? "h-10 w-[3px]" : "h-[3px] w-10",
        )}
      />
    </div>
  );
}

function Pane(props: {
  readonly threadKey: string;
  readonly weight: number;
  readonly topLeft: boolean;
}) {
  const leave = useSplitViewStore((state) => state.leave);
  const tabId = splitTabId(props.threadKey);
  const threadRef = tabId ? null : parseScopedThreadKey(props.threadKey);
  const thread = useThreadShell(threadRef);
  return (
    <div
      data-split-pane={props.threadKey}
      style={{ flex: `${props.weight} 1 0` }}
      className="rome-pane relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xs/5"
    >
      {tabId ? (
        <TabPane tabId={tabId} topLeft={props.topLeft} onClose={() => leave(props.threadKey)} />
      ) : threadRef && thread ? (
        <ChatView
          key={props.threadKey}
          environmentId={threadRef.environmentId}
          threadId={threadRef.threadId}
          routeKind="server"
          reserveTitleBarControlInset={props.topLeft}
          onClosePane={() => leave(props.threadKey)}
        />
      ) : null}
    </div>
  );
}

/** An open split: its chats as cards in rows, with handles between them to resize. */
export function SplitLayout(props: { readonly group: SplitGroup }) {
  const { group } = props;
  const columnWeights = useSplitViewStore((state) => state.columnWeights);
  const rowWeights = useSplitViewStore((state) => state.rowWeights[group.id]);
  const setColumnWeights = useSplitViewStore((state) => state.setColumnWeights);
  const setRowWeights = useSplitViewStore((state) => state.setRowWeights);

  return (
    <SidebarInset data-split="" className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div data-split-grid="" className="flex size-full min-h-0 flex-col">
        {group.rows.map((row, rowIndex) => (
          <Fragment key={rowIndex}>
            {rowIndex > 0 ? (
              <Handle
                axis="y"
                onReset={() =>
                  setRowWeights(
                    group.id,
                    group.rows.map(() => 1),
                  )
                }
                onDrag={(event) =>
                  dragBetween(event, "y", (share) => {
                    const total =
                      weightOr(rowWeights?.[rowIndex - 1]) + weightOr(rowWeights?.[rowIndex]);
                    const weights = group.rows.map((_, index) => weightOr(rowWeights?.[index]));
                    weights[rowIndex - 1] = total * share;
                    weights[rowIndex] = total * (1 - share);
                    setRowWeights(group.id, weights);
                  })
                }
              />
            ) : null}
            <div
              data-split-row={rowIndex}
              style={{ flex: `${weightOr(rowWeights?.[rowIndex])} 1 0` }}
              className="flex min-h-0 min-w-0"
            >
              {row.map((key, column) => (
                <Fragment key={key}>
                  {column > 0 ? (
                    <Handle
                      axis="x"
                      onReset={() =>
                        setColumnWeights(Object.fromEntries(row.map((member) => [member, 1])))
                      }
                      onDrag={(event) =>
                        dragBetween(event, "x", (share) => {
                          const left = row[column - 1]!;
                          const total =
                            weightOr(columnWeights[left]) + weightOr(columnWeights[key]);
                          setColumnWeights({ [left]: total * share, [key]: total * (1 - share) });
                        })
                      }
                    />
                  ) : null}
                  <Pane
                    threadKey={key}
                    weight={weightOr(columnWeights[key])}
                    topLeft={rowIndex === 0 && column === 0}
                  />
                </Fragment>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </SidebarInset>
  );
}
