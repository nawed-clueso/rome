import * as Schema from "effect/Schema";

import { ThreadId } from "./baseSchemas.ts";

/**
 * Rome's browser, as an agent reaches it. The server asks the Rome app, which
 * holds the user's tabs, and the app answers: list a chat's tabs, open a page as a
 * real tab under the chat, or make one of its tabs ready for the preview tools.
 */
export const RomeBrowserOperation = Schema.Literals([
  "tabs",
  "open",
  "use",
  "layout",
  "tab",
  "split",
  "folder",
  "space",
]);
export type RomeBrowserOperation = typeof RomeBrowserOperation.Type;

export const RomeBrowserRequest = Schema.Struct({
  requestId: Schema.String,
  threadId: ThreadId,
  operation: RomeBrowserOperation,
  input: Schema.Unknown,
});
export type RomeBrowserRequest = typeof RomeBrowserRequest.Type;

export const RomeBrowserRespondInput = Schema.Struct({
  requestId: Schema.String,
  ok: Schema.Boolean,
  value: Schema.optional(Schema.Unknown),
  message: Schema.optional(Schema.String),
});
export type RomeBrowserRespondInput = typeof RomeBrowserRespondInput.Type;

/** A tab the chat can use, as browser_tabs lists it. */
export const RomeBrowserTab = Schema.Struct({
  browserTabId: Schema.String,
  title: Schema.String,
  url: Schema.String,
  space: Schema.String,
  /** Why this chat has it: opened from the chat, or mentioned in it. */
  reason: Schema.Literals(["owned", "mentioned"]),
  /** The tab id for the preview tools while its page is loaded and shared; null when asleep. */
  tabId: Schema.NullOr(Schema.String),
});
export type RomeBrowserTab = typeof RomeBrowserTab.Type;

export const RomeBrowserTabsResult = Schema.Struct({ tabs: Schema.Array(RomeBrowserTab) });
export type RomeBrowserTabsResult = typeof RomeBrowserTabsResult.Type;

export const RomeBrowserOpenInput = Schema.Struct({
  url: Schema.String.annotate({ description: "The page to open, as a full URL." }),
  background: Schema.optional(
    Schema.Boolean.annotate({
      description: "Open without showing it to the user (default true).",
    }),
  ),
});
export type RomeBrowserOpenInput = typeof RomeBrowserOpenInput.Type;

export const RomeBrowserUseInput = Schema.Struct({
  browserTabId: Schema.String.annotate({
    description: "A browserTabId from browser_tabs. A sleeping tab is woken.",
  }),
});
export type RomeBrowserUseInput = typeof RomeBrowserUseInput.Type;

/** A tab ready for the preview tools: pass tabId to preview_snapshot, preview_click and the rest. */
export const RomeBrowserReadyTab = Schema.Struct({
  tabId: Schema.String,
  browserTabId: Schema.String,
  url: Schema.String,
  title: Schema.String,
});
export type RomeBrowserReadyTab = typeof RomeBrowserReadyTab.Type;

// Managing the browser: the sidebar's spaces, tabs, folders and splits, as the
// user arranges them by hand. Items are named `tab:<browserTabId>`,
// `chat:<threadId>` and `folder:<folderId>`; a bare id is a tab.

const ItemRef = Schema.String.annotate({
  description:
    "`tab:<browserTabId>`, `chat:<threadId>` or `folder:<folderId>`; a bare id is a tab.",
});

export const RomeBrowserLayoutSpace = Schema.Struct({
  spaceId: Schema.String,
  name: Schema.String,
  icon: Schema.NullOr(Schema.String),
  color: Schema.String,
  /** The space the window shows now. */
  current: Schema.Boolean,
  /** Open in another Rome window, whose tabs this list leaves out. */
  otherWindow: Schema.Boolean,
  /** Its top-level folders, in sidebar order. */
  folderIds: Schema.Array(Schema.String),
  /** Its tabs in sidebar order, pinned first. */
  tabIds: Schema.Array(Schema.String),
});
export type RomeBrowserLayoutSpace = typeof RomeBrowserLayoutSpace.Type;

export const RomeBrowserLayoutTab = Schema.Struct({
  browserTabId: Schema.String,
  title: Schema.String,
  url: Schema.String,
  spaceId: Schema.String,
  pinned: Schema.Boolean,
  /** The tab its space shows. */
  active: Schema.Boolean,
  /** Loaded, rather than asleep. */
  loaded: Schema.Boolean,
  folderId: Schema.NullOr(Schema.String),
  splitId: Schema.NullOr(Schema.String),
  /** The chat it belongs to: opened from it, or mentioned in it. */
  chat: Schema.NullOr(Schema.String),
});
export type RomeBrowserLayoutTab = typeof RomeBrowserLayoutTab.Type;

export const RomeBrowserLayoutFolder = Schema.Struct({
  folderId: Schema.String,
  name: Schema.String,
  spaceId: Schema.String,
  parentId: Schema.NullOr(Schema.String),
  collapsed: Schema.Boolean,
  items: Schema.Array(Schema.String),
});
export type RomeBrowserLayoutFolder = typeof RomeBrowserLayoutFolder.Type;

export const RomeBrowserLayoutSplit = Schema.Struct({
  splitId: Schema.String,
  name: Schema.NullOr(Schema.String),
  /** Top row first, each left to right. */
  rows: Schema.Array(Schema.Array(Schema.String)),
});
export type RomeBrowserLayoutSplit = typeof RomeBrowserLayoutSplit.Type;

export const RomeBrowserLayout = Schema.Struct({
  /** This chat, as `chat:<threadId>`. */
  thisChat: Schema.String,
  /** The space this chat lives in. */
  chatSpaceId: Schema.String,
  spaces: Schema.Array(RomeBrowserLayoutSpace),
  tabs: Schema.Array(RomeBrowserLayoutTab),
  folders: Schema.Array(RomeBrowserLayoutFolder),
  splits: Schema.Array(RomeBrowserLayoutSplit),
  /** The colours a space can take. */
  spaceColors: Schema.Array(Schema.String),
});
export type RomeBrowserLayout = typeof RomeBrowserLayout.Type;

export const RomeBrowserTabAction = Schema.Literals([
  "focus",
  "close",
  "pin",
  "unpin",
  "navigate",
  "back",
  "forward",
  "reload",
  "move",
  "move_to_space",
]);
export type RomeBrowserTabAction = typeof RomeBrowserTabAction.Type;

export const RomeBrowserTabInput = Schema.Struct({
  action: RomeBrowserTabAction.annotate({
    description:
      "focus shows the tab to the user; move reorders it among its space's tabs; move_to_space reopens it in another space (it gets a new browserTabId).",
  }),
  browserTabIds: Schema.Array(Schema.String).annotate({
    description: "The tabs to act on, from browser_layout or browser_tabs.",
  }),
  url: Schema.optional(Schema.String.annotate({ description: "For navigate: the full URL." })),
  beforeTabId: Schema.optional(
    Schema.NullOr(Schema.String).annotate({
      description: "For move: the tab to go before; null or left out for last.",
    }),
  ),
  spaceId: Schema.optional(Schema.String.annotate({ description: "For move_to_space." })),
});
export type RomeBrowserTabInput = typeof RomeBrowserTabInput.Type;

export const RomeBrowserSplitInput = Schema.Struct({
  action: Schema.Literals(["add", "remove", "separate", "rename"]).annotate({
    description:
      "add puts members beside a chat, in its split or a new one; remove takes members out of their split; separate ends a split; rename names it.",
  }),
  members: Schema.optional(
    Schema.Array(ItemRef).annotate({
      description: "For add and remove: tabs and chats.",
    }),
  ),
  beside: Schema.optional(
    ItemRef.annotate({
      description:
        "For add: the chat (or a member of its split) to go beside. Defaults to this chat.",
    }),
  ),
  side: Schema.optional(
    Schema.Literals(["left", "right", "top", "bottom"]).annotate({
      description: "For add: which side of `beside`. Left out, members go wherever there's room.",
    }),
  ),
  splitId: Schema.optional(Schema.String.annotate({ description: "For separate and rename." })),
  name: Schema.optional(
    Schema.String.annotate({ description: 'For rename; blank goes back to "Split view".' }),
  ),
});
export type RomeBrowserSplitInput = typeof RomeBrowserSplitInput.Type;

export const RomeBrowserFolderInput = Schema.Struct({
  action: Schema.Literals([
    "create",
    "rename",
    "add",
    "remove",
    "ungroup",
    "delete",
    "collapse",
    "expand",
  ]).annotate({
    description:
      "add files items into the folder (tabs in folders are pinned); remove takes them out; ungroup removes the folder and keeps what it held; delete removes it and closes its tabs.",
  }),
  folderId: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String.annotate({ description: "For create and rename." })),
  spaceId: Schema.optional(
    Schema.String.annotate({ description: "For create: defaults to this chat's space." }),
  ),
  parentId: Schema.optional(
    Schema.String.annotate({ description: "For create: the folder to make it in." }),
  ),
  items: Schema.optional(
    Schema.Array(ItemRef).annotate({ description: "For create, add and remove." }),
  ),
  before: Schema.optional(
    ItemRef.annotate({ description: "For add: the item to go before; left out for last." }),
  ),
  keepPinned: Schema.optional(
    Schema.Boolean.annotate({
      description: "For remove: keep removed tabs pinned (default false).",
    }),
  ),
});
export type RomeBrowserFolderInput = typeof RomeBrowserFolderInput.Type;

export const RomeBrowserSpaceInput = Schema.Struct({
  action: Schema.Literals(["switch", "create", "update", "move_chat"]).annotate({
    description:
      "switch shows a space; create makes one and shows it; update changes its name, icon or colour; move_chat moves chats (this one by default) to a space.",
  }),
  spaceId: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  icon: Schema.optional(
    Schema.NullOr(Schema.String).annotate({
      description: "An emoji; null shows the name's first letter.",
    }),
  ),
  color: Schema.optional(
    Schema.String.annotate({ description: "One of browser_layout's spaceColors." }),
  ),
  chats: Schema.optional(
    Schema.Array(Schema.String).annotate({
      description: "For move_chat: `chat:<threadId>` items; defaults to this chat.",
    }),
  ),
});
export type RomeBrowserSpaceInput = typeof RomeBrowserSpaceInput.Type;

/** What a change did, and the ids of anything it made. */
export const RomeBrowserChangeResult = Schema.Struct({
  message: Schema.String,
  ids: Schema.Array(Schema.String),
});
export type RomeBrowserChangeResult = typeof RomeBrowserChangeResult.Type;
