import type { RomeBrowser } from "@t3-ardia/entry";
import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, Columns2Icon } from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useThreadRouteTarget } from "~/hooks/useThreadRouteTarget";
import { readLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import { type SplitGroup, splitMembers, splitTabId, useSplitViewStore } from "~/splitViewStore";
import { useThreadShell } from "~/state/entities";
import { useBrowserModel, useTab } from "../../../browser/rome/browserStore";
import { spaceOfThread, useThreadSpaceStore } from "../../../browser/rome/threadSpaceStore";
import { SiteIcon } from "./BrowserTabRow";
import { buildThreadRouteParams } from "~/threadRoutes";
import { splitRoute } from "../../split/splitRoute";

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
        "hover:bg-sidebar-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
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

const SPLIT_DEFAULT_NAME = "Split view";

function SplitNameInput(props: { readonly group: SplitGroup; readonly onDone: () => void }) {
  const [draft, setDraft] = useState(props.group.name ?? "");
  const finish = (commit: boolean) => {
    if (commit) useSplitViewStore.getState().rename(props.group.id, draft);
    props.onDone();
  };
  return (
    <input
      autoFocus
      value={draft}
      placeholder={SPLIT_DEFAULT_NAME}
      aria-label="Split name"
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(true);
        else if (event.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      className="h-6 w-full min-w-0 rounded-md bg-sidebar-foreground/[0.06] px-2 text-sm text-sidebar-foreground outline-hidden ring-1 ring-ring"
    />
  );
}

function SplitBox(props: { readonly group: SplitGroup; readonly routeKey: string | null }) {
  const navigate = useNavigate();
  const { group, routeKey } = props;
  const members = splitMembers(group);
  const onSplitPage = useLocation({
    select: (location) => location.pathname === `/split/${group.id}`,
  });
  const open = onSplitPage || (routeKey !== null && members.includes(routeKey));
  const collapsed = group.collapsed === true;
  const [renaming, setRenaming] = useState(false);

  const openMember = (threadKey: string) => {
    // A chat opens the split on itself; a tab opens it as splitRoute does.
    const ref = splitTabId(threadKey) ? null : parseScopedThreadKey(threadKey);
    if (ref)
      void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
    else void navigate(splitRoute(group));
  };

  const showMenu = async (event: ReactMouseEvent, threadKey: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    const api = readLocalApi();
    if (!api) return;
    const choice = await api.contextMenu
      .show<"rename" | "separate" | "leave">(
        [
          { id: "rename", label: "Rename" },
          { id: "separate", label: "Separate tabs" },
          ...(threadKey ? [{ id: "leave" as const, label: "Remove from split" }] : []),
        ],
        { x: event.clientX, y: event.clientY },
      )
      .catch(() => null);
    if (choice === "rename") setRenaming(true);
    else if (choice === "separate") useSplitViewStore.getState().separate(group.id);
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
      {renaming ? (
        <SplitNameInput group={group} onDone={() => setRenaming(false)} />
      ) : (
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => useSplitViewStore.getState().setCollapsed(group.id, !collapsed)}
          onDoubleClick={() => setRenaming(true)}
          className={cn(
            "group/split flex h-6 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 font-medium text-sidebar-muted-foreground text-xs outline-hidden",
            "hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          )}
        >
          <Columns2Icon aria-hidden className="size-3" />
          <span className="min-w-0 flex-1 truncate text-left">
            {group.name ?? SPLIT_DEFAULT_NAME}
          </span>
          <span>{members.length}</span>
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "size-3 shrink-0 transition-transform duration-150",
              !collapsed && "rotate-90",
            )}
          />
        </button>
      )}
      <div className={cn("flex flex-col", collapsed && "hidden")}>
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
 * The space a split lives in: its first chat's, or its first tab's when it holds
 * only tabs. It moves with its chats, as chats move between spaces.
 */
function splitSpace(
  group: SplitGroup,
  model: RomeBrowser,
  spaceOf: Record<string, string>,
): string | null {
  const members = splitMembers(group);
  const chat = members.find((key) => !splitTabId(key));
  if (chat) {
    const spaceIds = model.spaces.map((space) => space.id);
    return spaceOfThread(spaceOf, chat, spaceIds);
  }
  for (const key of members) {
    const tab = model.tabs[splitTabId(key) ?? ""];
    if (tab) return tab.spaceId;
  }
  return null;
}

/**
 * Each split as one box above the list, the way Arc shows a split as one tab: it
 * opens when you pick any of its chats, and only dragging a chat in adds to it.
 */
export function SplitGroups() {
  const allGroups = useSplitViewStore((state) => state.groups);
  const spaceOf = useThreadSpaceStore((state) => state.spaceOf);
  // Each space shows its own splits; all of them until the browser has loaded.
  const groups = useBrowserModel(
    useShallow((state) => {
      const model = state.browser;
      if (!model?.spaceId) return allGroups;
      return allGroups.filter((group) => splitSpace(group, model, spaceOf) === model.spaceId);
    }),
  );
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
