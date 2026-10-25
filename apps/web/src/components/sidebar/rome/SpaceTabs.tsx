import type { RomeTab } from "@t3-ardia/entry";
import { useLocation } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";

import { readLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import { useBrowserModel } from "../../../browser/rome/browserStore";
import { BrowserTabRow } from "./BrowserTabRow";
import { useFolderDrag } from "./folderDrag";
import { createFolder } from "./folderMenus";
import { splitMembers, splitTabKey, useSplitViewStore } from "../../../splitViewStore";

const NONE: readonly RomeTab[] = [];

const isShown = (state: ReturnType<typeof useBrowserModel.getState>, tab: RomeTab) =>
  state.browser?.active[tab.spaceId] === tab.id;

/** The current space's tabs that belong to no thread, as the first block of the list. */
export function SpaceTabs() {
  // Tabs in a split show in its box instead.
  const groups = useSplitViewStore((state) => state.groups);
  const inSplit = new Set(groups.flatMap(splitMembers));
  const tabs = useBrowserModel(
    useShallow((state) => {
      const model = state.browser;
      if (!model?.spaceId) return NONE;
      return (model.order[model.spaceId] ?? []).flatMap((id) => {
        const tab = model.tabs[id];
        return tab && !tab.pinned && !tab.owner && tab.url && !inSplit.has(splitTabKey(id))
          ? [tab]
          : [];
      });
    }),
  );
  const activeId = useBrowserModel((state) =>
    state.browser?.spaceId ? (state.browser.active[state.browser.spaceId] ?? null) : null,
  );
  const onBrowse = useLocation({ select: (location) => location.pathname === "/browse" });
  // While a tab is dragged out of a folder, the list shows even when empty, to drop it back.
  const draggingTab = useFolderDrag()?.item.startsWith("tab:") ?? false;
  if (!tabs.length && !draggingTab) return null;
  return (
    <li
      role="presentation"
      data-folder-drop-list=""
      onContextMenu={(event) => {
        if (event.defaultPrevented) return;
        event.preventDefault();
        void readLocalApi()
          ?.contextMenu.show([{ id: "new-folder", label: "New folder", icon: "folder" }], {
            x: event.clientX,
            y: event.clientY,
          })
          .then((clicked) => {
            if (clicked === "new-folder") createFolder();
          });
      }}
      className={cn("list-none pb-2", !tabs.length && "min-h-12")}
    >
      <div className="flex h-6 items-center justify-between px-2 font-label text-[10.5px] text-sidebar-muted-foreground/70 uppercase tracking-[0.07em]">
        <span>Tabs</span>
        <span>{tabs.length || ""}</span>
      </div>
      <div className="flex flex-col gap-px">
        {tabs.map((tab) => (
          <BrowserTabRow key={tab.id} tab={tab} active={onBrowse && tab.id === activeId} />
        ))}
      </div>
    </li>
  );
}

/** A thread's own tabs, nested under its row. */
export function ThreadTabs(props: { readonly threadKey: string; readonly routeThread: boolean }) {
  const tabs = useBrowserModel(
    useShallow((state) => {
      const model = state.browser;
      if (!model) return NONE;
      const owned = Object.values(model.tabs).filter(
        (tab) => tab.owner === props.threadKey && tab.url,
      );
      return owned.length ? owned.toSorted((a, b) => a.id.localeCompare(b.id)) : NONE;
    }),
  );
  const shownIds = useBrowserModel(
    useShallow((state) => tabs.filter((tab) => isShown(state, tab)).map((tab) => tab.id)),
  );
  if (!tabs.length) return null;
  return (
    <div className="mt-0.5 mb-1 ml-[18px] flex flex-col gap-px border-sidebar-border border-l pl-2">
      {tabs.map((tab) => (
        <BrowserTabRow
          key={tab.id}
          tab={tab}
          nested
          active={props.routeThread && shownIds.includes(tab.id)}
        />
      ))}
    </div>
  );
}
