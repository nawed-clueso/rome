import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  MessageSquareIcon,
  PlusIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { useThreadRouteTarget } from "~/hooks/useThreadRouteTarget";
import { cn } from "~/lib/utils";
import { useBrowserModel } from "../../../browser/rome/browserStore";
import { fileItem } from "../../../browser/rome/folderActions";
import {
  type FolderItem,
  folderItem,
  parseFolderItem,
  type RomeFolder,
  useFolderStore,
} from "../../../browser/rome/folderStore";
import { useThreadShell } from "../../../state/entities";
import { buildThreadRouteParams } from "../../../threadRoutes";
import { threadContextDropTargetProps, useThreadContextDrop } from "../../chat/threadContextDrag";
import { BrowserTabRow } from "./BrowserTabRow";
import { startFolderDrag } from "./folderDrag";
import { showFolderMenu, startRenamingFolder, useFolderRename } from "./folderMenus";
import { splitRoute } from "../../split/splitRoute";

const NO_ROOTS: readonly string[] = [];
const FOLDER_DROP_ENVIRONMENT = "folder" as EnvironmentId;

export interface FolderHandlers {
  readonly onNewTab: (folderId: string) => void;
  readonly onThreadContextMenu: (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
  ) => void;
}

/** The mark at the front of a folder: its emoji, or a folder that opens with it. */
export function FolderMark(props: {
  readonly folder: RomeFolder;
  readonly open: boolean;
  readonly className?: string;
}) {
  if (props.folder.icon) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid size-4 shrink-0 place-items-center text-sm leading-none",
          props.className,
        )}
      >
        {props.folder.icon}
      </span>
    );
  }
  const Icon = props.open ? FolderOpenIcon : FolderIcon;
  return (
    <Icon
      aria-hidden
      className={cn("size-4 shrink-0 text-sidebar-muted-foreground", props.className)}
    />
  );
}

function FolderNameInput(props: { readonly folder: RomeFolder }) {
  const [draft, setDraft] = useState(props.folder.name);
  const finish = (commit: boolean) => {
    if (commit) useFolderStore.getState().rename(props.folder.id, draft);
    startRenamingFolder(null);
  };
  return (
    <input
      autoFocus
      value={draft}
      aria-label="Folder name"
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(true);
        else if (event.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      className="h-6 min-w-0 flex-1 rounded-md bg-sidebar-foreground/[0.06] px-1.5 text-sm outline-hidden ring-1 ring-ring"
    />
  );
}

function FolderName(props: { readonly folder: RomeFolder }) {
  const renaming = useFolderRename((state) => state.folderId === props.folder.id);
  if (renaming) return <FolderNameInput folder={props.folder} />;
  return <span className="min-w-0 flex-1 truncate">{props.folder.name}</span>;
}

function FolderThreadRow(props: {
  readonly threadKey: string;
  readonly current: boolean;
  readonly handlers: FolderHandlers;
}) {
  const navigate = useNavigate();
  const threadRef = parseScopedThreadKey(props.threadKey);
  const thread = useThreadShell(threadRef);
  if (!threadRef || !thread) return null;
  const title = thread.title || "Untitled";
  const open = () =>
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(threadRef) });
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={props.current ? "page" : undefined}
      data-folder-drop-item={folderItem.thread(props.threadKey)}
      onPointerDown={(event) => startFolderDrag(event, folderItem.thread(props.threadKey), title)}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        props.handlers.onThreadContextMenu(threadRef, { x: event.clientX, y: event.clientY });
      }}
      className={cn(
        "flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-sidebar-foreground outline-hidden",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        props.current ? "bg-sidebar-row-selected shadow-xs/5" : "hover:bg-sidebar-row-hover",
      )}
    >
      <MessageSquareIcon aria-hidden className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </div>
  );
}

function FolderTabItem(props: { readonly tabId: string; readonly onBrowse: boolean }) {
  const tab = useBrowserModel((state) => state.browser?.tabs[props.tabId] ?? null);
  const active = useBrowserModel(
    (state) =>
      !!state.browser?.spaceId && state.browser.active[state.browser.spaceId] === props.tabId,
  );
  if (!tab) return null;
  return <BrowserTabRow tab={tab} inFolder active={props.onBrowse && active} />;
}

function FolderEntry(props: {
  readonly item: FolderItem;
  readonly routeKey: string | null;
  readonly onBrowse: boolean;
  readonly handlers: FolderHandlers;
}) {
  const { kind, id } = parseFolderItem(props.item);
  if (kind === "folder")
    return (
      <FolderNode
        folderId={id}
        routeKey={props.routeKey}
        onBrowse={props.onBrowse}
        handlers={props.handlers}
      />
    );
  if (kind === "tab") return <FolderTabItem tabId={id} onBrowse={props.onBrowse} />;
  return (
    <FolderThreadRow threadKey={id} current={id === props.routeKey} handlers={props.handlers} />
  );
}

function FolderNode(props: {
  readonly folderId: string;
  readonly routeKey: string | null;
  readonly onBrowse: boolean;
  readonly handlers: FolderHandlers;
}) {
  const navigate = useNavigate();
  const folder = useFolderStore((state) => state.folders[props.folderId] ?? null);
  const header = useRef<HTMLDivElement | null>(null);
  const viewing = useLocation({
    select: (location) => location.pathname === `/folder/${props.folderId}`,
  });
  // Chats dragged from the list drop in here.
  useThreadContextDrop(header, FOLDER_DROP_ENVIRONMENT, props.folderId, (refs) => {
    const spaceId = useFolderStore.getState().folders[props.folderId]?.spaceId;
    if (!spaceId) return;
    for (const ref of refs)
      fileItem(folderItem.thread(scopedThreadKey(ref)), { spaceId, folderId: props.folderId });
  });
  if (!folder) return null;
  const open = !folder.collapsed;
  const toggle = () => useFolderStore.getState().setCollapsed(folder.id, open);
  const openView = (folderId: string) =>
    void navigate({ to: "/folder/$folderId", params: { folderId } });
  const menuAt = (position: { x: number; y: number }) =>
    void showFolderMenu(folder, position, {
      onNewTab: props.handlers.onNewTab,
      onOpenView: openView,
      onOpenSplit: (group) => void navigate(splitRoute(group)),
    });

  return (
    <div className="flex flex-col">
      <div
        ref={header}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-current={viewing ? "page" : undefined}
        data-folder-drop-folder={folder.id}
        data-drop-label="Move to folder"
        {...threadContextDropTargetProps()}
        onPointerDown={(event) => startFolderDrag(event, folderItem.folder(folder.id), folder.name)}
        onClick={toggle}
        onDoubleClick={() => startRenamingFolder(folder.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          } else if (event.key === "ArrowRight" && !open) toggle();
          else if (event.key === "ArrowLeft" && open) toggle();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          menuAt({ x: event.clientX, y: event.clientY });
        }}
        className={cn(
          "group/folder flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-sidebar-foreground outline-hidden",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          "data-[thread-context-over=true]:bg-sidebar-row-selected data-[thread-context-over=true]:ring-1 data-[thread-context-over=true]:ring-sidebar-foreground/25",
          viewing ? "bg-sidebar-row-selected shadow-xs/5" : "hover:bg-sidebar-row-hover",
        )}
      >
        <FolderMark folder={folder} open={open} />
        <FolderName folder={folder} />
        <span className="hidden items-center gap-0.5 group-hover/folder:flex">
          <button
            type="button"
            aria-label={`Open ${folder.name} as a page`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              openView(folder.id);
            }}
            className="grid size-5 cursor-pointer place-items-center rounded-md text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          >
            <FolderOpenIcon className="size-3" />
          </button>
          <button
            type="button"
            aria-label={`Add to ${folder.name}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              menuAt({ x: rect.left, y: rect.bottom + 4 });
            }}
            className="grid size-5 cursor-pointer place-items-center rounded-md text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          >
            <PlusIcon className="size-3" />
          </button>
        </span>
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-sidebar-muted-foreground/70 transition-transform duration-150",
            open && "rotate-90",
          )}
        />
      </div>
      {open ? (
        <div className="mt-px ml-[15px] flex flex-col gap-px border-sidebar-border border-l pl-1.5">
          {folder.items.length ? (
            folder.items.map((item) => (
              <FolderEntry
                key={item}
                item={item}
                routeKey={props.routeKey}
                onBrowse={props.onBrowse}
                handlers={props.handlers}
              />
            ))
          ) : (
            <div
              data-folder-drop-folder={folder.id}
              className="flex h-7 items-center px-2 text-sidebar-muted-foreground/70 text-xs"
            >
              Drag tabs or chats here
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** The current space's folders, as Arc keeps them: above the list, holding tabs, chats and folders. */
export function SpaceFolders(props: { readonly handlers: FolderHandlers }) {
  const spaceId = useBrowserModel((state) => state.browser?.spaceId ?? null);
  const roots = useFolderStore((state) =>
    spaceId ? (state.roots[spaceId] ?? NO_ROOTS) : NO_ROOTS,
  );
  const routeTarget = useThreadRouteTarget();
  const routeKey = routeTarget?.kind === "server" ? scopedThreadKey(routeTarget.threadRef) : null;
  const onBrowse = useLocation({ select: (location) => location.pathname === "/browse" });
  if (!roots.length) return null;
  return (
    <li role="presentation" className="flex list-none flex-col gap-px pb-2">
      {roots.map((id) => (
        <FolderNode
          key={id}
          folderId={id}
          routeKey={routeKey}
          onBrowse={onBrowse}
          handlers={props.handlers}
        />
      ))}
    </li>
  );
}
