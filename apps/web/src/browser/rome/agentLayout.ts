import type { RomeTab } from "@t3-ardia/entry";
import {
  parseScopedThreadKey,
  scopedThreadKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  type EnvironmentId,
  type RomeBrowserChangeResult,
  type RomeBrowserFolderInput,
  type RomeBrowserLayout,
  type RomeBrowserSpaceInput,
  type RomeBrowserSplitInput,
  type RomeBrowserTabInput,
  ThreadId,
} from "@t3tools/contracts";

import {
  type SplitSide,
  splitGroupOf,
  splitMembers,
  splitTabId,
  splitTabKey,
  useSplitViewStore,
} from "../../splitViewStore";
import { browser, switchSpaceAnimated, useBrowserModel } from "./browserStore";
import { closeFolderTab, deleteFolder, fileItem, ungroupFolder, unfileTab } from "./folderActions";
import {
  type FolderItem,
  filedItems,
  folderItem,
  parseFolderItem,
  useFolderStore,
} from "./folderStore";
import { useTabMentionStore } from "./tabMentionStore";
import { useThreadSpaceStore } from "./threadSpaceStore";

// The sidebar as an agent arranges it: the same spaces, tabs, folders and splits
// the user drags around, changed through the same stores the sidebar uses.

/** The chat asking, and how to show a tab to the user. */
export interface LayoutContext {
  readonly environmentId: EnvironmentId;
  /** The chat, as a scoped thread key. */
  readonly holder: string;
  readonly spaceId: string;
  readonly showTab: (tab: Pick<RomeTab, "id" | "owner">) => void;
}

type Ref =
  | { readonly kind: "tab"; readonly id: string }
  | { readonly kind: "chat"; readonly key: string }
  | { readonly kind: "folder"; readonly id: string };

const fail = (message: string): never => {
  throw new Error(message);
};

const chatRef = (threadKey: string) => {
  const ref = parseScopedThreadKey(threadKey);
  return `chat:${ref ? ref.threadId : threadKey}`;
};

const parseRef = (ref: string, context: LayoutContext): Ref => {
  const at = ref.indexOf(":");
  const kind = at < 0 ? "" : ref.slice(0, at);
  const id = ref.slice(at + 1);
  if (kind === "chat") {
    return {
      kind,
      key: scopedThreadKey(scopeThreadRef(context.environmentId, ThreadId.make(id))),
    };
  }
  if (kind === "folder") return { kind, id };
  return { kind: "tab", id: kind === "tab" ? id : ref };
};

const model = () => useBrowserModel.getState().browser ?? fail("Rome's browser hasn't loaded yet.");
const actions = () => browser() ?? fail("Rome's browser hasn't loaded yet.");

const tabOf = (id: string) =>
  model().tabs[id] ??
  fail(`No tab ${id} in this window. Call browser_layout for the tabs and their ids.`);

const spaceOf = (spaceId: string) => {
  const space = model().spaces.find((candidate) => candidate.id === spaceId);
  return space ?? fail(`No space ${spaceId}. Call browser_layout for the spaces.`);
};

const holderOf = (tab: RomeTab) => useTabMentionStore.getState().mentionedIn[tab.id] ?? tab.owner;

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const done = (message: string, ids: readonly string[] = []): RomeBrowserChangeResult => ({
  message,
  ids,
});

export function describeLayout(context: LayoutContext): RomeBrowserLayout {
  const browserModel = model();
  const { folders, roots } = useFolderStore.getState();
  const groups = useSplitViewStore.getState().groups;
  const filed = filedItems(folders);
  const splitOf = new Map<string, string>();
  for (const group of groups) for (const key of splitMembers(group)) splitOf.set(key, group.id);
  const itemOut = (item: FolderItem) => {
    const { kind, id } = parseFolderItem(item);
    return kind === "thread" ? chatRef(id) : item;
  };
  const memberOut = (key: string) => (splitTabId(key) ? key : chatRef(key));
  return {
    thisChat: chatRef(context.holder),
    chatSpaceId: context.spaceId,
    spaces: browserModel.spaces.map((space) => ({
      spaceId: space.id,
      name: space.name,
      icon: space.icon,
      color: space.color,
      current: space.id === browserModel.spaceId,
      otherWindow: Boolean(browserModel.elsewhere[space.id]),
      folderIds: [...(roots[space.id] ?? [])],
      tabIds: [...(browserModel.order[space.id] ?? [])],
    })),
    tabs: Object.values(browserModel.tabs).map((tab) => {
      const holder = holderOf(tab);
      return {
        browserTabId: tab.id,
        title: tab.title,
        url: tab.url,
        spaceId: tab.spaceId,
        pinned: tab.pinned,
        active: browserModel.active[tab.spaceId] === tab.id,
        loaded: actions().tabEngine(tab.id) !== null,
        folderId: filed.get(folderItem.tab(tab.id)) ?? null,
        splitId: splitOf.get(splitTabKey(tab.id)) ?? null,
        chat: holder ? chatRef(holder) : null,
      };
    }),
    folders: Object.values(folders).map((folder) => ({
      folderId: folder.id,
      name: folder.name,
      spaceId: folder.spaceId,
      parentId: folder.parentId,
      collapsed: folder.collapsed,
      items: folder.items.map(itemOut),
    })),
    splits: groups.map((group) => ({
      splitId: group.id,
      name: group.name ?? null,
      rows: group.rows.map((row) => row.map(memberOut)),
    })),
    spaceColors: actions().SPACE_COLORS.map((color) => color.id),
  };
}

export function changeTabs(
  input: RomeBrowserTabInput,
  context: LayoutContext,
): RomeBrowserChangeResult {
  if (input.browserTabIds.length === 0) fail("Name at least one tab in browserTabIds.");
  const tabs = input.browserTabIds.map(tabOf);
  const ids = tabs.map((tab) => tab.id);
  const browserActions = actions();
  switch (input.action) {
    case "focus": {
      if (tabs.length > 1) fail("focus takes one tab.");
      context.showTab(tabs[0]!);
      return done(`Showing "${tabs[0]!.title}".`, ids);
    }
    case "close":
      for (const id of ids) closeFolderTab(id);
      return done(`Closed ${plural(ids.length, "tab")}.`);
    case "pin":
    case "unpin":
      for (const tab of tabs) {
        const filed = filedItems(useFolderStore.getState().folders).has(folderItem.tab(tab.id));
        if (input.action === "unpin" && filed) unfileTab(tab.id, false);
        else browserActions.setPinned(tab.id, input.action === "pin");
      }
      return done(
        `${input.action === "pin" ? "Pinned" : "Unpinned"} ${plural(ids.length, "tab")}.`,
        ids,
      );
    case "navigate": {
      const url = input.url ?? fail("navigate needs a url.");
      if (!/^https?:\/\//iu.test(url)) fail("navigate takes a full http or https URL.");
      for (const id of ids) browserActions.navigateTab(id, url);
      return done(`Loading ${url} in ${plural(ids.length, "tab")}.`, ids);
    }
    case "back":
    case "forward":
    case "reload":
      for (const tab of tabs) {
        if (browserActions.tabEngine(tab.id)) browserActions.pageAction(tab.id, input.action);
        else if (input.action === "reload") browserActions.wakeTab(tab.id);
        else fail(`"${tab.title}" is asleep; focus it or call browser_use first.`);
      }
      return done(`Done for ${plural(ids.length, "tab")}.`, ids);
    case "move": {
      const before = input.beforeTabId ?? null;
      if (before !== null) tabOf(before);
      const filed = filedItems(useFolderStore.getState().folders);
      for (const tab of tabs) {
        // A tab in a folder keeps the folder's order, not the space's.
        const folderId = filed.get(folderItem.tab(tab.id));
        if (!folderId) {
          browserActions.moveTab(tab.id, before);
          continue;
        }
        if (before !== null && filed.get(folderItem.tab(before)) !== folderId) {
          fail(`"${tab.title}" is in a folder; move it before a tab in the same folder, or last.`);
        }
        useFolderStore.getState().move(folderItem.tab(tab.id), {
          spaceId: tab.spaceId,
          folderId,
          before: before === null ? null : folderItem.tab(before),
        });
      }
      return done(
        `Moved ${plural(ids.length, "tab")}${before === null ? " to the end of their list" : ""}. Tabs in a folder move within it.`,
        ids,
      );
    }
    case "move_to_space": {
      const spaceId = input.spaceId ?? fail("move_to_space needs a spaceId.");
      spaceOf(spaceId);
      if (model().elsewhere[spaceId]) fail("That space is open in another window.");
      const moved: string[] = [];
      for (const tab of tabs) {
        if (tab.spaceId === spaceId) {
          moved.push(tab.id);
          continue;
        }
        // A space keeps its own logins, so the page opens anew there.
        const id =
          browserActions.openTab(tab.url, { owner: tab.owner, spaceId, background: true }) ??
          fail(`Rome couldn't open "${tab.title}" in that space.`);
        if (tab.pinned) browserActions.setPinned(id, true);
        const mentionedIn = useTabMentionStore.getState().mentionedIn[tab.id];
        if (mentionedIn) useTabMentionStore.getState().mention(id, mentionedIn);
        closeFolderTab(tab.id);
        moved.push(id);
      }
      return done(
        `Moved ${plural(tabs.length, "tab")} to ${spaceOf(spaceId).name}. Their ids changed; use the ones here.`,
        moved,
      );
    }
  }
}

const splitKey = (ref: string, context: LayoutContext) => {
  const parsed = parseRef(ref, context);
  if (parsed.kind === "folder") return fail("A split holds tabs and chats, not folders.");
  if (parsed.kind === "chat") return parsed.key;
  return splitTabKey(tabOf(parsed.id).id);
};

export function changeSplit(
  input: RomeBrowserSplitInput,
  context: LayoutContext,
): RomeBrowserChangeResult {
  const store = useSplitViewStore.getState();
  const groupOf = (splitId: string) =>
    store.groups.find((group) => group.id === splitId) ??
    fail(`No split ${splitId}. Call browser_layout for the splits.`);
  switch (input.action) {
    case "add": {
      const members = (input.members ?? []).map((ref) => splitKey(ref, context));
      if (members.length === 0) fail("add needs members.");
      const beside = input.beside ? splitKey(input.beside, context) : context.holder;
      if (splitTabId(beside) && !splitGroupOf(store.groups, beside)) {
        fail("A split starts beside a chat; name a chat (or a tab already in a split) as beside.");
      }
      const side: SplitSide | undefined = input.side;
      // Each lands next to `beside`, so the ones after it go in backwards to keep their order.
      const ordered = side === "right" || side === "bottom" ? members.toReversed() : members;
      for (const member of ordered) {
        if (member === beside) continue;
        if (side) {
          useSplitViewStore.getState().place(beside, member, { target: beside, side });
        } else {
          useSplitViewStore.getState().join(beside, member);
        }
      }
      const group = splitGroupOf(useSplitViewStore.getState().groups, beside);
      const missing = members.filter(
        (member) => member !== beside && !group?.rows.some((row) => row.includes(member)),
      );
      if (missing.length > 0) {
        fail(
          `No room for ${plural(missing.length, "member")}: a split holds two rows of three, and each row three.`,
        );
      }
      return done(`Split view has ${plural(splitMembers(group!).length, "pane")}.`, [group!.id]);
    }
    case "remove": {
      const members = (input.members ?? []).map((ref) => splitKey(ref, context));
      if (members.length === 0) fail("remove needs members.");
      for (const member of members) useSplitViewStore.getState().leave(member);
      return done(`Took ${plural(members.length, "member")} out of their split.`);
    }
    case "separate": {
      const group = groupOf(input.splitId ?? fail("separate needs a splitId."));
      store.separate(group.id);
      return done("Ended the split view.");
    }
    case "rename": {
      const group = groupOf(input.splitId ?? fail("rename needs a splitId."));
      store.rename(group.id, input.name ?? "");
      return done(input.name?.trim() ? `Named it "${input.name.trim()}".` : "Unnamed it.", [
        group.id,
      ]);
    }
  }
}

const folderEntry = (ref: string, context: LayoutContext): FolderItem => {
  const parsed = parseRef(ref, context);
  if (parsed.kind === "chat") return folderItem.thread(parsed.key);
  if (parsed.kind === "folder") {
    if (!useFolderStore.getState().folders[parsed.id]) fail(`No folder ${parsed.id}.`);
    return folderItem.folder(parsed.id);
  }
  return folderItem.tab(tabOf(parsed.id).id);
};

/** A tab files only into a folder of its own space. */
const checkSpace = (item: FolderItem, spaceId: string) => {
  const { kind, id } = parseFolderItem(item);
  if (kind === "tab" && tabOf(id).spaceId !== spaceId) {
    fail(`"${tabOf(id).title}" is in another space; move it with browser_tab move_to_space first.`);
  }
};

export function changeFolder(
  input: RomeBrowserFolderInput,
  context: LayoutContext,
): RomeBrowserChangeResult {
  const store = useFolderStore.getState();
  const folderOf = () => {
    const id = input.folderId ?? fail(`${input.action} needs a folderId.`);
    return store.folders[id] ?? fail(`No folder ${id}. Call browser_layout for the folders.`);
  };
  const items = (input.items ?? []).map((ref) => folderEntry(ref, context));
  switch (input.action) {
    case "create": {
      const parent = input.parentId
        ? (store.folders[input.parentId] ?? fail(`No folder ${input.parentId}.`))
        : null;
      const spaceId = parent?.spaceId ?? input.spaceId ?? context.spaceId;
      spaceOf(spaceId);
      for (const item of items) checkSpace(item, spaceId);
      const id = store.create(spaceId, { parentId: parent?.id ?? null, name: input.name });
      for (const item of items) fileItem(item, { spaceId, folderId: id });
      return done(`Made a folder with ${plural(items.length, "item")}.`, [id]);
    }
    case "rename": {
      const folder = folderOf();
      if (!input.name?.trim()) fail("rename needs a name.");
      store.rename(folder.id, input.name!.trim());
      return done(`Renamed it "${input.name!.trim()}".`, [folder.id]);
    }
    case "add": {
      const folder = folderOf();
      if (items.length === 0) fail("add needs items.");
      const before = input.before ? folderEntry(input.before, context) : null;
      for (const item of items) {
        checkSpace(item, folder.spaceId);
        if (!fileItem(item, { spaceId: folder.spaceId, folderId: folder.id, before })) {
          fail(`Couldn't put ${item} in that folder (a folder can't go inside itself).`);
        }
      }
      return done(`Filed ${plural(items.length, "item")} in "${folder.name}".`, [folder.id]);
    }
    case "remove": {
      if (items.length === 0) fail("remove needs items.");
      for (const item of items) {
        const { kind, id } = parseFolderItem(item);
        if (kind === "tab") unfileTab(id, input.keepPinned ?? false);
        else if (kind === "thread") store.release(item);
        else {
          const spaceId = store.folders[id]!.spaceId;
          fileItem(item, { spaceId, folderId: null });
        }
      }
      return done(`Took ${plural(items.length, "item")} out of their folders.`);
    }
    case "ungroup":
      ungroupFolder(folderOf().id);
      return done("Removed the folder and kept what it held.");
    case "delete": {
      const folder = folderOf();
      deleteFolder(folder.id);
      return done(`Deleted "${folder.name}" and closed its tabs.`);
    }
    case "collapse":
    case "expand": {
      const folder = folderOf();
      store.setCollapsed(folder.id, input.action === "collapse");
      return done(`${input.action === "collapse" ? "Collapsed" : "Expanded"} "${folder.name}".`, [
        folder.id,
      ]);
    }
  }
}

export function changeSpace(
  input: RomeBrowserSpaceInput,
  context: LayoutContext,
): RomeBrowserChangeResult {
  const browserActions = actions();
  const color = input.color;
  if (color !== undefined && !browserActions.SPACE_COLORS.some((known) => known.id === color)) {
    fail(`Unknown colour ${color}. Use one of browser_layout's spaceColors.`);
  }
  switch (input.action) {
    case "switch": {
      const space = spaceOf(input.spaceId ?? fail("switch needs a spaceId."));
      if (model().elsewhere[space.id]) browserActions.switchSpace(space.id);
      else switchSpaceAnimated(space.id);
      return done(`Showing ${space.name}.`, [space.id]);
    }
    case "create": {
      const name = input.name?.trim() || fail("create needs a name.");
      const id = browserActions.createSpace({
        name,
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(color !== undefined ? { color } : {}),
      });
      return done(`Made the space ${name}.`, [id]);
    }
    case "update": {
      const space = spaceOf(input.spaceId ?? fail("update needs a spaceId."));
      browserActions.updateSpace(space.id, {
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(color !== undefined ? { color } : {}),
      });
      return done(`Updated ${input.name?.trim() || space.name}.`, [space.id]);
    }
    case "move_chat": {
      const space = spaceOf(input.spaceId ?? fail("move_chat needs a spaceId."));
      const chats = (input.chats ?? [chatRef(context.holder)]).map((ref) => {
        const parsed = parseRef(ref, context);
        return parsed.kind === "chat" ? parsed.key : fail(`${ref} isn't a chat (chat:<threadId>).`);
      });
      for (const key of chats) useThreadSpaceStore.getState().assign(key, space.id);
      return done(`Moved ${plural(chats.length, "chat")} to ${space.name}.`);
    }
  }
}
