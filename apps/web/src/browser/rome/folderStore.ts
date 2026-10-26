import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../../lib/storage";

/** Something a folder holds: a browser tab, a chat (by scoped thread key) or another folder. */
export type FolderItem = `tab:${string}` | `thread:${string}` | `folder:${string}`;

export interface RomeFolder {
  readonly id: string;
  readonly spaceId: string;
  /** The folder this one sits in; null at the top of its space. */
  readonly parentId: string | null;
  readonly name: string;
  /** An emoji the user chose; null draws a folder. */
  readonly icon: string | null;
  readonly collapsed: boolean;
  readonly items: readonly FolderItem[];
}

/** Where an item lands: in a folder (or the space's top level), before `before` or at the end. */
export interface FolderDestination {
  readonly spaceId: string;
  readonly folderId: string | null;
  readonly before?: FolderItem | null;
}

interface FolderState {
  readonly folders: Readonly<Record<string, RomeFolder>>;
  /** Each space's top-level folders, in order. */
  readonly roots: Readonly<Record<string, readonly string[]>>;
  readonly create: (
    spaceId: string,
    options?: {
      parentId?: string | null | undefined;
      name?: string | undefined;
      items?: readonly FolderItem[] | undefined;
    },
  ) => string;
  readonly rename: (folderId: string, name: string) => void;
  readonly setIcon: (folderId: string, icon: string | null) => void;
  readonly setCollapsed: (folderId: string, collapsed: boolean) => void;
  /** Moves an item into a folder, or out of folders; false where it can't go. */
  readonly move: (item: FolderItem, destination: FolderDestination) => boolean;
  /** Takes a tab or chat out of whatever folder holds it. */
  readonly release: (item: FolderItem) => void;
  /** Removes a folder, leaving what it held where the folder was. */
  readonly ungroup: (folderId: string) => void;
  /** Removes a folder and everything under it; returns the tabs it held. */
  readonly remove: (folderId: string) => string[];
}

export const folderItem = {
  tab: (id: string): FolderItem => `tab:${id}`,
  thread: (key: string): FolderItem => `thread:${key}`,
  folder: (id: string): FolderItem => `folder:${id}`,
};

export function parseFolderItem(item: FolderItem) {
  const split = item.indexOf(":");
  return { kind: item.slice(0, split) as "tab" | "thread" | "folder", id: item.slice(split + 1) };
}

/** The folder holding each tab, chat and folder, by item. */
const indexes = new WeakMap<object, ReadonlyMap<FolderItem, string>>();
export function filedItems(
  folders: Readonly<Record<string, RomeFolder>>,
): ReadonlyMap<FolderItem, string> {
  const known = indexes.get(folders);
  if (known) return known;
  const index = new Map<FolderItem, string>();
  for (const folder of Object.values(folders))
    for (const item of folder.items) index.set(item, folder.id);
  indexes.set(folders, index);
  return index;
}

/** The folder and its parents, innermost first. */
export function folderPath(
  folders: Readonly<Record<string, RomeFolder>>,
  folderId: string,
): RomeFolder[] {
  const path: RomeFolder[] = [];
  for (
    let at = folders[folderId];
    at && path.length < 64;
    at = at.parentId ? folders[at.parentId] : undefined
  ) {
    path.push(at);
  }
  return path;
}

/** Every tab under a folder, its subfolders included. */
export function tabsUnder(
  folders: Readonly<Record<string, RomeFolder>>,
  folderId: string,
): string[] {
  const folder = folders[folderId];
  if (!folder) return [];
  return folder.items.flatMap((item) => {
    const { kind, id } = parseFolderItem(item);
    return kind === "tab" ? [id] : kind === "folder" ? tabsUnder(folders, id) : [];
  });
}

const newId = () => `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const insert = <T>(list: readonly T[], value: T, before: T | null | undefined) => {
  const at = before == null ? -1 : list.indexOf(before);
  return at < 0 ? [...list, value] : [...list.slice(0, at), value, ...list.slice(at)];
};

type Draft = { folders: Record<string, RomeFolder>; roots: Record<string, readonly string[]> };

/** Takes `item` out of the folder (or top level) that holds it. */
function detach(draft: Draft, item: FolderItem) {
  // Searched, not indexed: the draft changes after this, and an index would be cached on it.
  const holder = Object.values(draft.folders).find((folder) => folder.items.includes(item))?.id;
  if (holder) {
    const folder = draft.folders[holder]!;
    draft.folders[holder] = { ...folder, items: folder.items.filter((other) => other !== item) };
  }
  const { kind, id } = parseFolderItem(item);
  if (kind === "folder" && !holder) {
    const spaceId = draft.folders[id]?.spaceId;
    if (spaceId)
      draft.roots[spaceId] = (draft.roots[spaceId] ?? []).filter((other) => other !== id);
  }
}

export const useFolderStore = create<FolderState>()(
  persist(
    (set, get) => ({
      folders: {},
      roots: {},
      create: (spaceId, options = {}) => {
        const id = newId();
        const draft: Draft = { folders: { ...get().folders }, roots: { ...get().roots } };
        const parentId =
          options.parentId && draft.folders[options.parentId] ? options.parentId : null;
        for (const item of options.items ?? []) detach(draft, item);
        draft.folders[id] = {
          id,
          spaceId,
          parentId,
          name: options.name?.trim() || "New Folder",
          icon: null,
          collapsed: false,
          items: [...(options.items ?? [])],
        };
        if (parentId) {
          const parent = draft.folders[parentId]!;
          draft.folders[parentId] = {
            ...parent,
            collapsed: false,
            items: [...parent.items, folderItem.folder(id)],
          };
        } else {
          draft.roots[spaceId] = [...(draft.roots[spaceId] ?? []), id];
        }
        set(draft);
        return id;
      },
      rename: (folderId, name) =>
        set((state) => {
          const folder = state.folders[folderId];
          const trimmed = name.trim();
          if (!folder || !trimmed || folder.name === trimmed) return state;
          return { folders: { ...state.folders, [folderId]: { ...folder, name: trimmed } } };
        }),
      setIcon: (folderId, icon) =>
        set((state) => {
          const folder = state.folders[folderId];
          if (!folder || folder.icon === icon) return state;
          return { folders: { ...state.folders, [folderId]: { ...folder, icon } } };
        }),
      setCollapsed: (folderId, collapsed) =>
        set((state) => {
          const folder = state.folders[folderId];
          if (!folder || folder.collapsed === collapsed) return state;
          return { folders: { ...state.folders, [folderId]: { ...folder, collapsed } } };
        }),
      move: (item, destination) => {
        const state = get();
        const { kind, id } = parseFolderItem(item);
        const target = destination.folderId ? state.folders[destination.folderId] : null;
        if (destination.folderId && !target) return false;
        if (destination.before === item) return true;
        if (kind === "folder") {
          const folder = state.folders[id];
          if (!folder || folder.spaceId !== destination.spaceId) return false;
          // A folder can't go inside itself or a folder it holds.
          if (target && folderPath(state.folders, target.id).some((at) => at.id === id))
            return false;
        }
        const draft: Draft = { folders: { ...state.folders }, roots: { ...state.roots } };
        detach(draft, item);
        if (target) {
          const fresh = draft.folders[target.id]!;
          draft.folders[target.id] = {
            ...fresh,
            items: insert(fresh.items, item, destination.before),
          };
        } else if (kind === "folder") {
          const before = destination.before ? parseFolderItem(destination.before) : null;
          draft.roots[destination.spaceId] = insert(
            draft.roots[destination.spaceId] ?? [],
            id,
            before?.kind === "folder" ? before.id : null,
          );
        }
        if (kind === "folder")
          draft.folders[id] = { ...draft.folders[id]!, parentId: target?.id ?? null };
        set(draft);
        return true;
      },
      release: (item) => {
        if (!filedItems(get().folders).has(item)) return;
        const draft: Draft = { folders: { ...get().folders }, roots: { ...get().roots } };
        detach(draft, item);
        set(draft);
      },
      ungroup: (folderId) => {
        const state = get();
        const folder = state.folders[folderId];
        if (!folder) return;
        const draft: Draft = { folders: { ...state.folders }, roots: { ...state.roots } };
        const self = folderItem.folder(folderId);
        if (folder.parentId && draft.folders[folder.parentId]) {
          const parent = draft.folders[folder.parentId]!;
          const at = parent.items.indexOf(self);
          draft.folders[folder.parentId] = {
            ...parent,
            items: [...parent.items.slice(0, at), ...folder.items, ...parent.items.slice(at + 1)],
          };
        } else {
          // At the top level, subfolders take its place; tabs and chats go back to the list.
          const roots = draft.roots[folder.spaceId] ?? [];
          const at = roots.indexOf(folderId);
          const children = folder.items.flatMap((item) => {
            const parsed = parseFolderItem(item);
            return parsed.kind === "folder" ? [parsed.id] : [];
          });
          draft.roots[folder.spaceId] = [
            ...roots.slice(0, at),
            ...children,
            ...roots.slice(at + 1),
          ];
        }
        for (const item of folder.items) {
          const parsed = parseFolderItem(item);
          if (parsed.kind === "folder" && draft.folders[parsed.id]) {
            draft.folders[parsed.id] = { ...draft.folders[parsed.id]!, parentId: folder.parentId };
          }
        }
        delete draft.folders[folderId];
        set(draft);
      },
      remove: (folderId) => {
        const state = get();
        const folder = state.folders[folderId];
        if (!folder) return [];
        const tabs = tabsUnder(state.folders, folderId);
        const draft: Draft = { folders: { ...state.folders }, roots: { ...state.roots } };
        detach(draft, folderItem.folder(folderId));
        const drop = (id: string) => {
          const gone = draft.folders[id];
          if (!gone) return;
          delete draft.folders[id];
          for (const item of gone.items) {
            const parsed = parseFolderItem(item);
            if (parsed.kind === "folder") drop(parsed.id);
          }
        };
        drop(folderId);
        set(draft);
        return tabs;
      },
    }),
    {
      name: "rome:folders:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ folders: state.folders, roots: state.roots }),
    },
  ),
);
