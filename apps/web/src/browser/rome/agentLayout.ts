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
  type RomeBrowserLayoutView,
  type RomeBrowserSpaceInput,
  type RomeBrowserSplitInput,
  type RomeBrowserTabInput,
  type RomeBrowserViewInput,
  ThreadId,
} from "@t3tools/contracts";

import {
  evenRows,
  rowsFit,
  type SplitGroup,
  type SplitSide,
  splitGroupOf,
  splitMembers,
  splitTabId,
  splitTabKey,
  useSplitViewStore,
} from "../../splitViewStore";
import { splitRoute } from "../../components/split/splitRoute";
import { buildThreadRouteParams } from "../../threadRoutes";
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

/** Where the window can go, as the router takes it. */
export type ViewRoute =
  | { readonly to: "/$environmentId/$threadId"; readonly params: Record<string, string> }
  | { readonly to: "/split/$splitId"; readonly params: { readonly splitId: string } }
  | { readonly to: "/folder/$folderId"; readonly params: { readonly folderId: string } }
  | { readonly to: "/browse" }
  | { readonly to: "/new" };

/** The chat asking, and how to show things to the user. */
export interface LayoutContext {
  readonly environmentId: EnvironmentId;
  /** The chat, as a scoped thread key. */
  readonly holder: string;
  readonly spaceId: string;
  readonly showTab: (tab: Pick<RomeTab, "id" | "owner">) => void;
  readonly navigate: (route: ViewRoute) => void;
  /** The window's path now, as the router has it. */
  readonly pathname: () => string;
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

const percents = (weights: readonly number[]) => {
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map((weight) => Math.round((weight / total) * 1000) / 10);
};
const weightOr = (value: number | undefined) => (value && value > 0 ? value : 1);

/** A split's row heights and pane widths, in percent, as its panes show them. */
function splitSizes(group: SplitGroup) {
  const { columnWeights, rowWeights } = useSplitViewStore.getState();
  return {
    rowSizes: percents(group.rows.map((_, index) => weightOr(rowWeights[group.id]?.[index]))),
    columnSizes: group.rows.map((row) => percents(row.map((key) => weightOr(columnWeights[key])))),
  };
}

/** What the window shows, read from its route. */
function currentView(context: LayoutContext): RomeBrowserLayoutView {
  const [first = "", second] = context
    .pathname()
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  const none = { id: null, browserTabId: null };
  if (first === "split" && second) return { ...none, kind: "split", id: second };
  if (first === "folder" && second) return { ...none, kind: "folder", id: second };
  if (first === "browse") {
    const browserModel = useBrowserModel.getState().browser;
    const active = browserModel?.spaceId ? browserModel.active[browserModel.spaceId] : null;
    return { ...none, kind: "browser", browserTabId: active ?? null };
  }
  if (first === "" || first === "new" || first === "draft") return { ...none, kind: "new" };
  if (second) {
    const key = scopedThreadKey(scopeThreadRef(first as EnvironmentId, ThreadId.make(second)));
    const group = splitGroupOf(useSplitViewStore.getState().groups, key);
    return group
      ? { ...none, kind: "split", id: group.id }
      : { ...none, kind: "chat", id: chatRef(key) };
  }
  return { ...none, kind: "other" };
}

const showSplit = (group: SplitGroup, context: LayoutContext) =>
  context.navigate(splitRoute(group));

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
  const view = currentView(context);
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
      icon: folder.icon,
      color: folder.color ?? null,
      spaceId: folder.spaceId,
      parentId: folder.parentId,
      collapsed: folder.collapsed,
      items: folder.items.map(itemOut),
    })),
    splits: groups.map((group) => ({
      splitId: group.id,
      name: group.name ?? null,
      rows: group.rows.map((row) => row.map(memberOut)),
      shown: view.kind === "split" && view.id === group.id,
      collapsed: group.collapsed === true,
      ...splitSizes(group),
    })),
    view,
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

/** A ref as split members: a tab or chat is one, a folder is the tabs and chats it holds directly. */
const splitKeys = (ref: string, context: LayoutContext): string[] => {
  const parsed = parseRef(ref, context);
  if (parsed.kind === "chat") return [parsed.key];
  if (parsed.kind === "tab") return [splitTabKey(tabOf(parsed.id).id)];
  const folder =
    useFolderStore.getState().folders[parsed.id] ??
    fail(`No folder ${parsed.id}. Call browser_layout for the folders.`);
  return folder.items.flatMap((item) => {
    const { kind, id } = parseFolderItem(item);
    if (kind === "tab") return model().tabs[id] ? [splitTabKey(id)] : [];
    return kind === "thread" ? [id] : [];
  });
};

const membersOf = (refs: readonly string[], context: LayoutContext) => [
  ...new Set(refs.flatMap((ref) => splitKeys(ref, context))),
];

const NO_FIT =
  "A split holds one or two rows of one to three panes, two panes at least, each once.";

const rowsOf = (input: RomeBrowserSplitInput, context: LayoutContext) => {
  if (input.rows) return input.rows.map((row) => membersOf(row, context));
  const members = membersOf(input.members ?? [], context);
  if (members.length > 6) {
    fail(`That's ${members.length} panes; a split holds six at most. Make two splits.`);
  }
  return evenRows(members);
};

const shape = (group: SplitGroup) =>
  group.rows.map((row) => row.length).join(" over ") +
  (group.rows.length > 1 ? "" : " side by side");

export function changeSplit(
  input: RomeBrowserSplitInput,
  context: LayoutContext,
): RomeBrowserChangeResult {
  const store = () => useSplitViewStore.getState();
  const groupOf = (splitId: string | undefined) =>
    store().groups.find(
      (group) => group.id === (splitId ?? fail(`${input.action} needs a splitId.`)),
    ) ?? fail(`No split ${splitId}. Call browser_layout for the splits.`);
  const finish = (group: SplitGroup, message: string) => {
    if (input.show) showSplit(group, context);
    return done(`${message} (${shape(group)})${input.show ? ", on screen" : ""}.`, [group.id]);
  };
  switch (input.action) {
    case "create": {
      const rows = rowsOf(input, context);
      if (!rowsFit(rows)) fail(NO_FIT);
      const id = store().setRows(null, rows) ?? fail(NO_FIT);
      if (input.name?.trim()) store().rename(id, input.name);
      return finish(groupOf(id), `Made a split of ${plural(rows.flat().length, "pane")}`);
    }
    case "add": {
      const members = membersOf(input.members ?? [], context);
      if (members.length === 0) fail("add needs members.");
      const beside = input.beside
        ? (splitKeys(input.beside, context)[0] ?? fail("Nothing to go beside."))
        : context.holder;
      const side: SplitSide | undefined = input.side;
      // Each lands next to `beside`, so the ones after it go in backwards to keep their order.
      const ordered = side === "right" || side === "bottom" ? members.toReversed() : members;
      for (const member of ordered) {
        if (member === beside) continue;
        if (side) store().place(beside, member, { target: beside, side });
        else store().join(beside, member);
      }
      const group = splitGroupOf(store().groups, beside);
      const missing = members.filter(
        (member) => member !== beside && !group?.rows.some((row) => row.includes(member)),
      );
      if (missing.length > 0 || !group) {
        fail(
          `No room for ${plural(missing.length, "member")}: a split holds two rows of three, and each row three.`,
        );
      }
      return finish(group!, `Split view has ${plural(splitMembers(group!).length, "pane")}`);
    }
    case "remove": {
      const members = membersOf(input.members ?? [], context);
      if (members.length === 0) fail("remove needs members.");
      for (const member of members) store().leave(member);
      return done(`Took ${plural(members.length, "member")} out of their split.`);
    }
    case "arrange": {
      const group = groupOf(input.splitId);
      if (!input.rows) fail("arrange needs rows.");
      const rows = rowsOf(input, context);
      if (!rowsFit(rows)) fail(NO_FIT);
      store().setRows(group.id, rows);
      return finish(groupOf(group.id), "Laid it out");
    }
    case "resize": {
      const group = groupOf(input.splitId);
      const rowSizes = input.sizes?.rows;
      const columnSizes = input.sizes?.columns;
      if (rowSizes && rowSizes.length !== group.rows.length) {
        fail(`sizes.rows needs ${group.rows.length} numbers, one per row.`);
      }
      if (columnSizes && columnSizes.length !== group.rows.length) {
        fail(`sizes.columns needs ${group.rows.length} lists, one per row.`);
      }
      const positive = (values: readonly number[]) => values.every((value) => value > 0);
      store().setRowWeights(
        group.id,
        rowSizes && positive(rowSizes) ? rowSizes : group.rows.map(() => 1),
      );
      const weights: Record<string, number> = {};
      group.rows.forEach((row, index) => {
        const sizes = columnSizes?.[index];
        if (sizes && sizes.length !== row.length) {
          fail(`Row ${index + 1} has ${plural(row.length, "pane")}; give it that many sizes.`);
        }
        row.forEach((key, column) => {
          weights[key] = sizes && positive(sizes) ? sizes[column]! : 1;
        });
      });
      store().setColumnWeights(weights);
      const sizes = splitSizes(groupOf(group.id));
      return done(
        `Sized it: rows ${sizes.rowSizes.join("/")}%, panes ${sizes.columnSizes.map((row) => row.join("/")).join(" | ")}%.`,
        [group.id],
      );
    }
    case "open": {
      const group = groupOf(input.splitId);
      showSplit(group, context);
      return done(`Showing ${group.name ?? "the split"}.`, [group.id]);
    }
    case "separate": {
      const group = groupOf(input.splitId);
      store().separate(group.id);
      return done("Ended the split view.");
    }
    case "rename": {
      const group = groupOf(input.splitId);
      store().rename(group.id, input.name ?? "");
      return done(input.name?.trim() ? `Named it "${input.name.trim()}".` : "Unnamed it.", [
        group.id,
      ]);
    }
    case "collapse":
    case "expand": {
      const group = groupOf(input.splitId);
      store().setCollapsed(group.id, input.action === "collapse");
      return done(input.action === "collapse" ? "Folded it in the sidebar." : "Unfolded it.", [
        group.id,
      ]);
    }
  }
}

export function changeView(
  input: RomeBrowserViewInput,
  context: LayoutContext,
): RomeBrowserChangeResult {
  const target = input.show.trim();
  if (target === "browser") {
    context.navigate({ to: "/browse" });
    return done("Showing the browser.");
  }
  if (target === "new") {
    context.navigate({ to: "/new" });
    return done("Showing the new chat screen.");
  }
  if (target.startsWith("split:")) {
    const id = target.slice(6);
    const group =
      useSplitViewStore.getState().groups.find((entry) => entry.id === id) ??
      fail(`No split ${id}. Call browser_layout for the splits.`);
    showSplit(group, context);
    return done(`Showing ${group.name ?? "the split"}.`, [id]);
  }
  const parsed = parseRef(target, context);
  if (parsed.kind === "folder") {
    const folder =
      useFolderStore.getState().folders[parsed.id] ??
      fail(`No folder ${parsed.id}. Call browser_layout for the folders.`);
    context.navigate({ to: "/folder/$folderId", params: { folderId: folder.id } });
    return done(`Showing the folder "${folder.name}".`, [folder.id]);
  }
  if (parsed.kind === "chat") {
    const ref = parseScopedThreadKey(parsed.key) ?? fail(`No chat ${target}.`);
    context.navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
    return done("Showing the chat.");
  }
  const tab = tabOf(parsed.id);
  context.showTab(tab);
  return done(`Showing "${tab.title}".`, [tab.id]);
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

/** A colour id from SPACE_COLORS, or null; anything else fails. */
const checkFolderColor = (color: string | null): string | null => {
  if (color === null) return null;
  const known = actions().SPACE_COLORS.map((option) => option.id);
  return known.includes(color)
    ? color
    : fail(`No colour ${color}; use one of ${known.join(", ")}.`);
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
      const color = input.color === undefined ? undefined : checkFolderColor(input.color);
      const id = store.create(spaceId, { parentId: parent?.id ?? null, name: input.name });
      if (input.icon !== undefined || color !== undefined) {
        useFolderStore.getState().customize(id, {
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
          ...(color !== undefined ? { color } : {}),
        });
      }
      for (const item of items) fileItem(item, { spaceId, folderId: id });
      return done(`Made a folder with ${plural(items.length, "item")}.`, [id]);
    }
    case "customize": {
      const folder = folderOf();
      if (input.name === undefined && input.icon === undefined && input.color === undefined) {
        fail("customize needs a name, icon or color.");
      }
      const color = input.color === undefined ? undefined : checkFolderColor(input.color);
      store.customize(folder.id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(color !== undefined ? { color } : {}),
      });
      return done(`Updated "${useFolderStore.getState().folders[folder.id]!.name}".`, [folder.id]);
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
