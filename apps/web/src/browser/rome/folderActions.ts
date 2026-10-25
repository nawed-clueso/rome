import { browser, useBrowserModel } from "./browserStore";
import {
  type FolderDestination,
  type FolderItem,
  folderItem,
  parseFolderItem,
  useFolderStore,
} from "./folderStore";
import { useThreadSpaceStore } from "./threadSpaceStore";

// Folders hold pinned tabs, as Arc's do: they stay put, belong to no thread,
// and come back with the app.

/** Puts a tab, chat or folder into a folder, or back out to the list. */
export function fileItem(item: FolderItem, destination: FolderDestination): boolean {
  const { kind, id } = parseFolderItem(item);
  if (!useFolderStore.getState().move(item, destination)) return false;
  if (kind === "tab") browser()?.setPinned(id, destination.folderId !== null);
  if (kind === "thread" && destination.folderId) {
    useThreadSpaceStore.getState().assign(id, destination.spaceId);
  }
  return true;
}

/** Takes a tab out of its folder: back among the space's tabs, or up with the pinned tiles. */
export function unfileTab(tabId: string, keepPinned: boolean) {
  useFolderStore.getState().release(folderItem.tab(tabId));
  browser()?.setPinned(tabId, keepPinned);
}

export function closeFolderTab(tabId: string) {
  useFolderStore.getState().release(folderItem.tab(tabId));
  browser()?.closeTab(tabId);
}

/** Makes a folder in the current space, holding `items` if given; returns its id. */
export function newFolder(
  options: { parentId?: string | null; items?: readonly FolderItem[]; name?: string } = {},
) {
  const spaceId = useBrowserModel.getState().browser?.spaceId;
  if (!spaceId) return null;
  const parentSpace = options.parentId
    ? useFolderStore.getState().folders[options.parentId]?.spaceId
    : null;
  const id = useFolderStore
    .getState()
    .create(parentSpace ?? spaceId, { parentId: options.parentId, name: options.name });
  for (const item of options.items ?? [])
    fileItem(item, { spaceId: parentSpace ?? spaceId, folderId: id });
  return id;
}

/** Removes a folder, keeping what it held; at the top level its tabs go back among the space's tabs. */
export function ungroupFolder(folderId: string) {
  const folder = useFolderStore.getState().folders[folderId];
  if (!folder) return;
  useFolderStore.getState().ungroup(folderId);
  if (folder.parentId) return;
  for (const item of folder.items) {
    const { kind, id } = parseFolderItem(item);
    if (kind === "tab") browser()?.setPinned(id, false);
  }
}

/** Deletes a folder with its subfolders and closes the tabs in them; its chats go back to the list. */
export function deleteFolder(folderId: string) {
  const tabs = useFolderStore.getState().remove(folderId);
  for (const tabId of tabs) browser()?.closeTab(tabId);
}
