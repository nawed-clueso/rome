import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useSyncExternalStore } from "react";

import { useBrowserModel } from "../../../browser/rome/browserStore";
import { fileItem, unfileTab } from "../../../browser/rome/folderActions";
import {
  type FolderItem,
  filedItems,
  folderItem,
  folderPath,
  parseFolderItem,
  useFolderStore,
} from "../../../browser/rome/folderStore";
import {
  dropTab,
  dropThreadContext,
  endThreadContextDrag,
  moveThreadContextDrag,
} from "../../chat/threadContextDrag";

// Drop targets mark themselves with these attributes:
//   data-folder-drop-folder="<id>"  a folder's row: drop into it, or above it near its top edge
//   data-folder-drop-item="<item>"  a row inside a folder: drop above or below it
//   data-folder-drop-list           the space's loose tabs: out of folders
//   data-folder-drop-tiles          the pinned tiles: out of folders, still pinned

export type FolderDrop =
  | { readonly kind: "into"; readonly folderId: string }
  | {
      readonly kind: "before" | "after";
      readonly item: FolderItem;
      readonly folderId: string | null;
    }
  | { readonly kind: "list" }
  | { readonly kind: "tiles" };

export interface FolderDragState {
  readonly item: FolderItem;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly drop: FolderDrop | null;
  /** Where the drop would land, for the indicator. */
  readonly rect: DOMRect | null;
}

let state: FolderDragState | null = null;
const listeners = new Set<() => void>();
const emit = (next: FolderDragState | null) => {
  state = next;
  for (const listener of listeners) listener();
};

export const useFolderDrag = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => null,
  );

const DRAG_DISTANCE = 4;

/** What the pointer is over, if it is somewhere `item` can go. */
function dropAt(
  item: FolderItem,
  x: number,
  y: number,
): { drop: FolderDrop; rect: DOMRect } | null {
  const element = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>(
      "[data-folder-drop-folder],[data-folder-drop-item],[data-folder-drop-list],[data-folder-drop-tiles]",
    );
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const { kind, id } = parseFolderItem(item);
  const folders = useFolderStore.getState().folders;
  // A folder can't go into itself or anything inside it.
  const inside = (folderId: string | null) =>
    kind === "folder" &&
    folderId !== null &&
    folderPath(folders, folderId).some((at) => at.id === id);

  const folderId = element.dataset.folderDropFolder;
  if (folderId) {
    if (folderItem.folder(folderId) === item) return null;
    const parentId = folders[folderId]?.parentId ?? null;
    if (y < rect.top + rect.height * 0.3 && !inside(parentId)) {
      return {
        drop: { kind: "before", item: folderItem.folder(folderId), folderId: parentId },
        rect,
      };
    }
    return inside(folderId) ? null : { drop: { kind: "into", folderId }, rect };
  }
  const target = element.dataset.folderDropItem as FolderItem | undefined;
  if (target) {
    if (target === item) return null;
    const holder = filedItems(folders).get(target) ?? null;
    if (inside(holder)) return null;
    const side = y < rect.top + rect.height / 2 ? "before" : "after";
    return { drop: { kind: side, item: target, folderId: holder }, rect };
  }
  if (kind !== "tab") return null;
  if (element.hasAttribute("data-folder-drop-tiles")) return { drop: { kind: "tiles" }, rect };
  return { drop: { kind: "list" }, rect };
}

function applyDrop(item: FolderItem, drop: FolderDrop) {
  const spaceId = useBrowserModel.getState().browser?.spaceId;
  const { kind, id } = parseFolderItem(item);
  if (!spaceId) return;
  if (drop.kind === "list" || drop.kind === "tiles") {
    if (kind === "tab") unfileTab(id, drop.kind === "tiles");
    return;
  }
  if (drop.kind === "into") {
    fileItem(item, { spaceId, folderId: drop.folderId });
    return;
  }
  let before: FolderItem | null = drop.item;
  if (drop.kind === "after") {
    const { folders, roots } = useFolderStore.getState();
    const siblings = drop.folderId
      ? (folders[drop.folderId]?.items ?? [])
      : (roots[spaceId] ?? []).map(folderItem.folder);
    const rest = siblings.filter((sibling) => sibling !== item);
    before = rest[rest.indexOf(drop.item) + 1] ?? null;
  }
  // Tabs and chats only live inside folders; between top-level folders they go to the end of the space.
  if (drop.folderId === null && kind !== "folder") return;
  fileItem(item, { spaceId, folderId: drop.folderId, before });
}

/**
 * Starts dragging a sidebar row once the pointer has moved a little. Inside the
 * sidebar it files the row; a chat dragged out over the content area goes into a
 * split or a composer, like any chat.
 */
export function startFolderDrag(
  event: ReactPointerEvent<HTMLElement>,
  item: FolderItem,
  title: string,
) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
  const origin = event.currentTarget;
  const sidebar =
    origin.closest<HTMLElement>('[data-slot="sidebar-inner"]') ??
    origin.closest<HTMLElement>('[data-slot="sidebar-content"]') ??
    origin.parentElement;
  const startX = event.clientX;
  const startY = event.clientY;
  const parsed = parseFolderItem(item);
  const threadRef = parsed.kind === "thread" ? parseScopedThreadKey(parsed.id) : null;
  // Chats and tabs can leave the sidebar, into a split.
  const tabId = parsed.kind === "tab" ? parsed.id : null;
  let dragging = false;
  let outside = false;

  const isOutside = (x: number) => {
    const bounds = sidebar?.getBoundingClientRect();
    return bounds !== undefined && x > bounds.right;
  };
  const move = (moveEvent: PointerEvent) => {
    const { clientX: x, clientY: y } = moveEvent;
    if (!dragging) {
      if (Math.hypot(x - startX, y - startY) < DRAG_DISTANCE) return;
      dragging = true;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      window.getSelection()?.removeAllRanges();
    }
    outside = (threadRef !== null || tabId !== null) && isOutside(x);
    if (outside) {
      // The chat drag's own ghost and drop zone take over out there.
      moveThreadContextDrag({ x, y }, { title, count: 1, ...(tabId ? { tabId } : {}) });
      emit(null);
      return;
    }
    endThreadContextDrag();
    const found = dropAt(item, x, y);
    emit({ item, title, x, y, drop: found?.drop ?? null, rect: found?.rect ?? null });
  };
  const end = (upEvent: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", escape);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    if (!dragging) return;
    // The click that ends a drag isn't a click on the row.
    const swallow = (click: MouseEvent) => {
      click.preventDefault();
      click.stopPropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    const current = state;
    emit(null);
    if (outside) {
      const point = { x: upEvent.clientX, y: upEvent.clientY };
      if (threadRef) dropThreadContext(point, [threadRef]);
      else if (tabId) dropTab(point, tabId);
      endThreadContextDrag();
      return;
    }
    if (current?.drop) applyDrop(item, current.drop);
  };
  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", escape);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    endThreadContextDrag();
    emit(null);
  };
  const escape = (keyEvent: KeyboardEvent) => {
    if (keyEvent.key === "Escape") cancel();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", escape);
}
