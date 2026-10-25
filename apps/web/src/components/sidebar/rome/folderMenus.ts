import type { ContextMenuItem } from "@t3tools/contracts";
import { create } from "zustand";

import { readLocalApi } from "~/localApi";
import { useBrowserModel } from "../../../browser/rome/browserStore";
import {
  deleteFolder,
  fileItem,
  newFolder,
  ungroupFolder,
} from "../../../browser/rome/folderActions";
import {
  type FolderItem,
  filedItems,
  parseFolderItem,
  type RomeFolder,
  tabsUnder,
  useFolderStore,
} from "../../../browser/rome/folderStore";

/** The folder whose name is being typed, right after it is made or when renaming. */
export const useFolderRename = create<{ folderId: string | null }>()(() => ({ folderId: null }));
export const startRenamingFolder = (folderId: string | null) =>
  useFolderRename.setState({ folderId });

/** Makes a folder and puts its name up for typing. */
export function createFolder(options: Parameters<typeof newFolder>[0] = {}) {
  const id = newFolder(options);
  if (id) startRenamingFolder(id);
  return id;
}

const INDENT = " ";

/** The current space's folders, depth first, for a "Move to folder" menu. */
function folderOptions(): { folder: RomeFolder; depth: number }[] {
  const spaceId = useBrowserModel.getState().browser?.spaceId;
  const { folders, roots } = useFolderStore.getState();
  if (!spaceId) return [];
  const out: { folder: RomeFolder; depth: number }[] = [];
  const walk = (id: string, depth: number) => {
    const folder = folders[id];
    if (!folder) return;
    out.push({ folder, depth });
    for (const item of folder.items) {
      const parsed = parseFolderItem(item);
      if (parsed.kind === "folder") walk(parsed.id, depth + 1);
    }
  };
  for (const id of roots[spaceId] ?? []) walk(id, 0);
  return out;
}

export type MoveToFolderId = `move-folder:${string}`;

/**
 * "Move to folder", for a tab or chat's menu: every folder in the space, a new
 * one, and a way back out when it is already in one.
 */
export function moveToFolderMenu(item: FolderItem): ContextMenuItem<MoveToFolderId> {
  const holder = filedItems(useFolderStore.getState().folders).get(item) ?? null;
  const options = folderOptions();
  return {
    id: "move-folder:menu",
    label: holder ? "Move to folder" : "Add to folder",
    icon: "folder",
    children: [
      ...options.map(({ folder, depth }) => ({
        id: `move-folder:${folder.id}` as const,
        label: `${INDENT.repeat(depth)}${folder.icon ? `${folder.icon} ` : ""}${folder.name}`,
        checked: folder.id === holder,
      })),
      { id: "move-folder:new", label: "New folder…", separatorBefore: options.length > 0 },
      ...(holder ? [{ id: "move-folder:none" as const, label: "Remove from folder" }] : []),
    ],
  };
}

/** Applies a "Move to folder" choice; `release` takes the item back out of folders. */
export function applyMoveToFolder(item: FolderItem, choice: string, release: () => void) {
  const spaceId = useBrowserModel.getState().browser?.spaceId;
  const target = choice.slice("move-folder:".length);
  if (!spaceId || target === "menu") return;
  if (target === "none") release();
  else if (target === "new") createFolder({ items: [item] });
  else fileItem(item, { spaceId, folderId: target });
}

const FOLDER_ICONS = [
  "📁",
  "⭐️",
  "💼",
  "🏠",
  "📚",
  "🧪",
  "🎨",
  "🛠️",
  "💡",
  "🚀",
  "🎧",
  "📈",
  "🛒",
  "✈️",
  "❤️",
  "🔥",
];

type FolderMenuId =
  | "new-tab"
  | "new-subfolder"
  | "open-view"
  | "rename"
  | "icon"
  | `icon:${string}`
  | "icon-reset"
  | "ungroup"
  | "delete";

/** A folder's own menu. */
export async function showFolderMenu(
  folder: RomeFolder,
  position: { x: number; y: number },
  handlers: {
    readonly onNewTab: (folderId: string) => void;
    readonly onOpenView: (folderId: string) => void;
  },
) {
  const api = readLocalApi();
  if (!api) return;
  const tabCount = tabsUnder(useFolderStore.getState().folders, folder.id).length;
  const items: ContextMenuItem<FolderMenuId>[] = [
    { id: "new-tab", label: "New tab in folder", icon: "message-square-plus" },
    { id: "new-subfolder", label: "New folder inside", icon: "folder" },
    { id: "open-view", label: "Open folder view", icon: "folder-tree" },
    { id: "rename", label: "Rename", icon: "pencil", separatorBefore: true },
    {
      id: "icon",
      label: "Change icon",
      children: [
        ...FOLDER_ICONS.map((icon) => ({
          id: `icon:${icon}` as const,
          label: icon,
          checked: folder.icon === icon,
        })),
        {
          id: "icon-reset",
          label: "Plain folder",
          separatorBefore: true,
          checked: folder.icon === null,
        },
      ],
    },
    { id: "ungroup", label: "Ungroup", separatorBefore: true },
    {
      id: "delete",
      label: tabCount
        ? `Delete folder and close ${tabCount === 1 ? "1 tab" : `${tabCount} tabs`}`
        : "Delete folder",
      icon: "trash",
      destructive: true,
    },
  ];
  const clicked = await api.contextMenu.show(items, position).catch(() => null);
  if (!clicked) return;
  const store = useFolderStore.getState();
  if (clicked.startsWith("icon:")) return store.setIcon(folder.id, clicked.slice("icon:".length));
  switch (clicked) {
    case "new-tab":
      return handlers.onNewTab(folder.id);
    case "new-subfolder":
      return void createFolder({ parentId: folder.id });
    case "open-view":
      return handlers.onOpenView(folder.id);
    case "rename":
      return startRenamingFolder(folder.id);
    case "icon-reset":
      return store.setIcon(folder.id, null);
    case "ungroup":
      return ungroupFolder(folder.id);
    case "delete": {
      if (tabCount > 0) {
        const confirmed = await api.dialogs.confirm(
          `Delete "${folder.name}"? Its ${tabCount === 1 ? "tab closes" : `${tabCount} tabs close`}; its chats go back to the list.`,
        );
        if (!confirmed) return;
      }
      return deleteFolder(folder.id);
    }
  }
}
