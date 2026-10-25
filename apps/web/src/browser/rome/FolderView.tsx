import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, FolderPlusIcon, MessageSquareIcon, PlusIcon } from "lucide-react";
import { useState, type MouseEvent as ReactMouseEvent } from "react";

import { readLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import { SiteIcon, showTabMenu } from "../../components/sidebar/rome/BrowserTabRow";
import { createFolder, showFolderMenu } from "../../components/sidebar/rome/folderMenus";
import { FolderMark } from "../../components/sidebar/rome/SpaceFolders";
import { Button } from "../../components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../../components/ui/empty";
import { openNewScreen } from "../../newScreenStore";
import { useThreadShell } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useBrowserModel } from "./browserStore";
import {
  type FolderItem,
  folderPath,
  parseFolderItem,
  type RomeFolder,
  tabsUnder,
  useFolderStore,
} from "./folderStore";
import { useShowTab } from "./useShowTab";

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const cardClass = cn(
  "group/card flex min-w-0 cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-3.5 text-left outline-hidden transition-colors",
  "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
);

function SubfolderCard(props: {
  readonly folder: RomeFolder;
  readonly onOpen: (id: string) => void;
}) {
  const folders = useFolderStore((state) => state.folders);
  const count = props.folder.items.length;
  const tabs = tabsUnder(folders, props.folder.id).length;
  return (
    <button
      type="button"
      onClick={() => props.onOpen(props.folder.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        void showFolderMenu(
          props.folder,
          { x: event.clientX, y: event.clientY },
          {
            onNewTab: (id) => openNewScreen("browse", id),
            onOpenView: props.onOpen,
          },
        );
      }}
      className={cardClass}
    >
      <FolderMark folder={props.folder} open={false} className="size-5 text-lg" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium text-sm">{props.folder.name}</span>
        <span className="truncate text-muted-foreground text-xs">
          {count === 0
            ? "Empty"
            : `${count} ${count === 1 ? "item" : "items"}${tabs ? `, ${tabs} ${tabs === 1 ? "tab" : "tabs"} inside` : ""}`}
        </span>
      </span>
    </button>
  );
}

function TabCard(props: { readonly tabId: string }) {
  const tab = useBrowserModel((state) => state.browser?.tabs[props.tabId] ?? null);
  const showTab = useShowTab();
  if (!tab) return null;
  return (
    <button
      type="button"
      onClick={() => showTab(tab)}
      onContextMenu={(event) => {
        event.preventDefault();
        void showTabMenu(tab, { x: event.clientX, y: event.clientY });
      }}
      className={cardClass}
    >
      <SiteIcon src={tab.favicon} className="size-5" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium text-sm">{tab.title}</span>
        <span className="truncate text-muted-foreground text-xs">{hostOf(tab.url)}</span>
      </span>
    </button>
  );
}

function ChatCard(props: {
  readonly threadKey: string;
  readonly onRemove: (item: FolderItem) => void;
}) {
  const navigate = useNavigate();
  const threadRef = parseScopedThreadKey(props.threadKey);
  const thread = useThreadShell(threadRef);
  if (!threadRef || !thread) return null;
  const onContextMenu = async (event: ReactMouseEvent) => {
    event.preventDefault();
    const clicked = await readLocalApi()
      ?.contextMenu.show([{ id: "remove", label: "Remove from folder" }], {
        x: event.clientX,
        y: event.clientY,
      })
      .catch(() => null);
    if (clicked === "remove") props.onRemove(`thread:${props.threadKey}`);
  };
  return (
    <button
      type="button"
      onClick={() =>
        void navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(threadRef),
        })
      }
      onContextMenu={(event) => void onContextMenu(event)}
      className={cardClass}
    >
      <MessageSquareIcon aria-hidden className="size-5 text-muted-foreground" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium text-sm">{thread.title || "Untitled"}</span>
        <span className="truncate text-muted-foreground text-xs">Chat</span>
      </span>
    </button>
  );
}

function FolderTitle(props: { readonly folder: RomeFolder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.folder.name);
  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`Rename ${props.folder.name}`}
        onClick={() => {
          setDraft(props.folder.name);
          setEditing(true);
        }}
        className="min-w-0 cursor-text truncate text-left font-display font-semibold text-2xl tracking-tight outline-hidden"
      >
        {props.folder.name}
      </button>
    );
  }
  const finish = (commit: boolean) => {
    if (commit) useFolderStore.getState().rename(props.folder.id, draft);
    setEditing(false);
  };
  return (
    <input
      autoFocus
      value={draft}
      aria-label="Folder name"
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(true);
        else if (event.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      className="min-w-0 flex-1 bg-transparent font-display font-semibold text-2xl tracking-tight outline-hidden"
    />
  );
}

/** A folder as a page: where it sits, and everything in it as cards. */
export function FolderView(props: { readonly folderId: string }) {
  const navigate = useNavigate();
  const folder = useFolderStore((state) => state.folders[props.folderId] ?? null);
  const folders = useFolderStore((state) => state.folders);
  const space = useBrowserModel(
    (state) => state.browser?.spaces.find((option) => option.id === folder?.spaceId) ?? null,
  );
  if (!folder) {
    return (
      <Empty className="flex-1">
        <EmptyHeader className="max-w-md">
          <EmptyTitle>This folder is gone</EmptyTitle>
          <EmptyDescription>It was deleted or ungrouped.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const openFolder = (folderId: string) =>
    void navigate({ to: "/folder/$folderId", params: { folderId } });
  const parents = folderPath(folders, folder.id).slice(1).toReversed();
  const subfolders = folder.items.flatMap((item) => {
    const { kind, id } = parseFolderItem(item);
    const child = kind === "folder" ? folders[id] : undefined;
    return child ? [child] : [];
  });
  const entries = folder.items.filter((item) => !item.startsWith("folder:"));
  const tabCount = entries.filter((item) => item.startsWith("tab:")).length;
  const chatCount = entries.length - tabCount;
  const summary = [
    subfolders.length
      ? `${subfolders.length} ${subfolders.length === 1 ? "folder" : "folders"}`
      : null,
    tabCount ? `${tabCount} ${tabCount === 1 ? "tab" : "tabs"}` : null,
    chatCount ? `${chatCount} ${chatCount === 1 ? "chat" : "chats"}` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-8 pt-14 pb-12">
      <header className="flex flex-col gap-3">
        <nav
          aria-label="Folder path"
          className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs"
        >
          <span className="truncate">{space?.name ?? "Space"}</span>
          {parents.map((parent) => (
            <span key={parent.id} className="flex min-w-0 items-center gap-1">
              <ChevronRightIcon aria-hidden className="size-3 shrink-0" />
              <Link
                to="/folder/$folderId"
                params={{ folderId: parent.id }}
                className="truncate hover:text-foreground"
              >
                {parent.name}
              </Link>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <FolderMark folder={folder} open className="size-7 text-2xl" />
          <FolderTitle key={folder.id} folder={folder} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => createFolder({ parentId: folder.id })}
            >
              <FolderPlusIcon aria-hidden />
              New folder
            </Button>
            <Button size="sm" onClick={() => openNewScreen("browse", folder.id)}>
              <PlusIcon aria-hidden />
              New tab
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          {summary.length ? summary.join(", ") : "Nothing here yet"}
        </p>
      </header>

      {subfolders.length ? (
        <section aria-label="Folders" className="flex flex-col gap-3">
          <h2 className="font-label text-[10.5px] text-muted-foreground uppercase tracking-[0.07em]">
            Folders
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
            {subfolders.map((child) => (
              <SubfolderCard key={child.id} folder={child} onOpen={openFolder} />
            ))}
          </div>
        </section>
      ) : null}

      {entries.length ? (
        <section aria-label="Tabs and chats" className="flex flex-col gap-3">
          <h2 className="font-label text-[10.5px] text-muted-foreground uppercase tracking-[0.07em]">
            Inside
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
            {entries.map((item) => {
              const { kind, id } = parseFolderItem(item);
              return kind === "tab" ? (
                <TabCard key={item} tabId={id} />
              ) : (
                <ChatCard
                  key={item}
                  threadKey={id}
                  onRemove={(gone) => useFolderStore.getState().release(gone)}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {!subfolders.length && !entries.length ? (
        <div className="rounded-xl border border-border border-dashed">
          <Empty>
            <EmptyHeader className="max-w-sm">
              <EmptyTitle>Empty folder</EmptyTitle>
              <EmptyDescription>
                Drag tabs and chats onto this folder in the sidebar, or open a new tab in it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : null}
    </div>
  );
}
