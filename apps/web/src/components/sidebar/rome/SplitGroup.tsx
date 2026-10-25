import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { Columns2Icon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { useThreadRouteTarget } from "~/hooks/useThreadRouteTarget";
import { readLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import { type SplitGroup, splitMembers, splitTabId, useSplitViewStore } from "~/splitViewStore";
import { useThreadShell } from "~/state/entities";
import { useTab } from "../../../browser/rome/browserStore";
import { SiteIcon } from "./BrowserTabRow";
import { buildThreadRouteParams } from "~/threadRoutes";

function MemberRow(props: {
  readonly threadKey: string;
  readonly current: boolean;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onContextMenu: (event: ReactMouseEvent) => void;
}) {
  const tabId = splitTabId(props.threadKey);
  const thread = useThreadShell(tabId ? null : parseScopedThreadKey(props.threadKey));
  const tab = useTab(tabId ?? "");
  return (
    <button
      type="button"
      onClick={props.onOpen}
      onContextMenu={props.onContextMenu}
      aria-current={props.current ? "page" : undefined}
      className={cn(
        "flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm outline-hidden",
        "hover:bg-sidebar-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring",
        props.open ? "text-sidebar-foreground" : "text-sidebar-foreground/75",
      )}
    >
      {tabId ? (
        <SiteIcon src={tab?.favicon ?? null} className="size-3.5 shrink-0" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "mx-1 size-1.5 shrink-0 rounded-full",
            props.current ? "bg-sidebar-foreground" : "bg-sidebar-foreground/30",
          )}
        />
      )}
      <span className="min-w-0 flex-1 truncate">
        {tabId ? (tab?.title ?? "Closed tab") : thread?.title || "Untitled"}
      </span>
    </button>
  );
}

function SplitBox(props: { readonly group: SplitGroup; readonly routeKey: string | null }) {
  const navigate = useNavigate();
  const { group, routeKey } = props;
  const members = splitMembers(group);
  const open = routeKey !== null && members.includes(routeKey);

  const openMember = (threadKey: string) => {
    // A tab opens the split through one of its chats.
    const chat = splitTabId(threadKey) ? members.find((key) => !splitTabId(key)) : threadKey;
    const ref = chat ? parseScopedThreadKey(chat) : null;
    if (ref)
      void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };

  const showMenu = async (event: ReactMouseEvent, threadKey: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    const api = readLocalApi();
    if (!api) return;
    const choice = await api.contextMenu
      .show<"separate" | "leave">(
        [
          { id: "separate", label: "Separate tabs" },
          ...(threadKey ? [{ id: "leave" as const, label: "Remove from split" }] : []),
        ],
        { x: event.clientX, y: event.clientY },
      )
      .catch(() => null);
    if (choice === "separate") useSplitViewStore.getState().separate(group.id);
    else if (choice === "leave" && threadKey) useSplitViewStore.getState().leave(threadKey);
  };

  return (
    <div
      onContextMenu={(event) => void showMenu(event, null)}
      className={cn(
        "rounded-xl p-1 ring-1 ring-inset transition-colors",
        open
          ? "bg-sidebar-foreground/[0.06] ring-sidebar-foreground/20"
          : "bg-sidebar-foreground/[0.025] ring-sidebar-foreground/10",
      )}
    >
      <div className="flex h-6 items-center gap-1.5 px-2 font-label text-[10.5px] text-sidebar-muted-foreground uppercase tracking-[0.07em]">
        <Columns2Icon aria-hidden className="size-3" />
        <span className="flex-1">Split view</span>
        <span>{members.length}</span>
      </div>
      <div className="flex flex-col">
        {members.map((key) => (
          <MemberRow
            key={key}
            threadKey={key}
            current={key === routeKey}
            open={open}
            onOpen={() => openMember(key)}
            onContextMenu={(event) => void showMenu(event, key)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Each split as one box above the list, the way Arc shows a split as one tab: it
 * opens when you pick any of its chats, and only dragging a chat in adds to it.
 */
export function SplitGroups() {
  const groups = useSplitViewStore((state) => state.groups);
  const routeTarget = useThreadRouteTarget();
  const routeKey = routeTarget?.kind === "server" ? scopedThreadKey(routeTarget.threadRef) : null;
  if (groups.length === 0) return null;
  return (
    <li role="presentation" className="flex list-none flex-col gap-1.5 pb-2">
      {groups.map((group) => (
        <SplitBox key={group.id} group={group} routeKey={routeKey} />
      ))}
    </li>
  );
}
