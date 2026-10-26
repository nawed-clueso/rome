import type { RomeTab } from "@t3-ardia/entry";
import { BotIcon, GlobeIcon, Volume2Icon, XIcon } from "lucide-react";
import { memo, useState, type MouseEvent as ReactMouseEvent } from "react";

import { readLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import { useAgentDriving } from "../../../browser/rome/agentActivityStore";
import { browser } from "../../../browser/rome/browserStore";
import { closeFolderTab, unfileTab } from "../../../browser/rome/folderActions";
import { filedItems, folderItem, useFolderStore } from "../../../browser/rome/folderStore";
import { useShowTab } from "../../../browser/rome/useShowTab";
import { startFolderDrag } from "./folderDrag";
import { applyMoveToFolder, type MoveToFolderId, moveToFolderMenu } from "./folderMenus";

/** A site's icon, or a globe when it has none or it fails to load. */
export function SiteIcon({ src, className }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    return <GlobeIcon aria-hidden className={cn("text-sidebar-muted-foreground", className)} />;
  }
  return (
    <img
      alt=""
      src={src}
      draggable={false}
      onError={() => setFailed(src)}
      className={cn("rounded-[3px] object-contain", className)}
    />
  );
}

type TabMenuId = "pin" | "unpin" | "copy-link" | "close" | MoveToFolderId;

export async function showTabMenu(tab: RomeTab, position: { x: number; y: number }) {
  const api = readLocalApi();
  if (!api) return;
  const item = folderItem.tab(tab.id);
  const filed = filedItems(useFolderStore.getState().folders).has(item);
  const clicked = await api.contextMenu
    .show<TabMenuId>(
      [
        ...(filed
          ? []
          : [
              tab.pinned
                ? { id: "unpin" as const, label: "Unpin", icon: "pin-off" }
                : { id: "pin" as const, label: "Pin", icon: "pin" },
            ]),
        moveToFolderMenu(item),
        { id: "copy-link", label: "Copy link", icon: "copy", separatorBefore: true },
        { id: "close", label: "Close", separatorBefore: true },
      ],
      position,
    )
    .catch(() => null);
  if (clicked?.startsWith("move-folder:")) {
    return applyMoveToFolder(item, clicked, () => unfileTab(tab.id, false));
  }
  switch (clicked) {
    case "pin":
      return browser()?.setPinned(tab.id, true);
    case "unpin":
      return browser()?.setPinned(tab.id, false);
    case "copy-link":
      return void navigator.clipboard.writeText(tab.url);
    case "close":
      return filed ? closeFolderTab(tab.id) : browser()?.closeTab(tab.id);
  }
}

/** One browser tab in the sidebar: under its thread, in a folder, or among the space's own tabs. */
export const BrowserTabRow = memo(function BrowserTabRow(props: {
  readonly tab: RomeTab;
  readonly active: boolean;
  readonly nested?: boolean;
  readonly inFolder?: boolean;
}) {
  const { tab, active, nested = false, inFolder = false } = props;
  const showTab = useShowTab();
  const driving = useAgentDriving(tab.id);
  const onContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    void showTabMenu(tab, { x: event.clientX, y: event.clientY });
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "page" : undefined}
      data-browser-tab={tab.id}
      data-folder-drop-item={inFolder ? folderItem.tab(tab.id) : undefined}
      onPointerDown={(event) => startFolderDrag(event, folderItem.tab(tab.id), tab.title)}
      onClick={() => showTab(tab)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        showTab(tab);
      }}
      onContextMenu={onContextMenu}
      className={cn(
        "group/tab flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm outline-hidden",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        nested ? "h-7 text-sidebar-muted-foreground" : "h-8 text-sidebar-foreground",
        active
          ? "bg-sidebar-row-selected text-sidebar-foreground shadow-xs/5"
          : "hover:bg-sidebar-row-hover",
      )}
    >
      <SiteIcon src={tab.favicon} className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{tab.title}</span>
      {driving ? (
        <BotIcon
          aria-label="The agent is working in this tab"
          className="size-3.5 shrink-0 animate-pulse text-sidebar-muted-foreground"
        />
      ) : null}
      {tab.audible ? (
        <Volume2Icon
          aria-label="Playing audio"
          className="size-3.5 shrink-0 text-sidebar-muted-foreground"
        />
      ) : null}
      <button
        type="button"
        aria-label={`Close ${tab.title}`}
        onClick={(event) => {
          event.stopPropagation();
          if (inFolder) closeFolderTab(tab.id);
          else browser()?.closeTab(tab.id);
        }}
        className="-mr-1 hidden size-5 shrink-0 cursor-pointer place-items-center rounded-md text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground group-hover/tab:grid"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
});
