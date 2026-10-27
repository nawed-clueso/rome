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
  "view",
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
  /** Its emoji; null draws a plain folder. */
  icon: Schema.NullOr(Schema.String),
  /** One of spaceColors; null when plain. */
  color: Schema.NullOr(Schema.String),
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
  /** On screen now. */
  shown: Schema.Boolean,
  /** Folded to its header in the sidebar. */
  collapsed: Schema.Boolean,
  /** Each row's share of the height, in percent. */
  rowSizes: Schema.Array(Schema.Number),
  /** Each pane's share of its row's width, in percent, by row. */
  columnSizes: Schema.Array(Schema.Array(Schema.Number)),
});
export type RomeBrowserLayoutSplit = typeof RomeBrowserLayoutSplit.Type;

/** What the window shows now. */
export const RomeBrowserLayoutView = Schema.Struct({
  kind: Schema.Literals(["chat", "split", "folder", "browser", "new", "other"]),
  /** `chat:<threadId>`, the splitId or the folderId; null for the others. */
  id: Schema.NullOr(Schema.String),
  /** For browser: the tab on screen. */
  browserTabId: Schema.NullOr(Schema.String),
});
export type RomeBrowserLayoutView = typeof RomeBrowserLayoutView.Type;

export const RomeBrowserLayout = Schema.Struct({
  /** This chat, as `chat:<threadId>`. */
  thisChat: Schema.String,
  /** The space this chat lives in. */
  chatSpaceId: Schema.String,
  spaces: Schema.Array(RomeBrowserLayoutSpace),
  tabs: Schema.Array(RomeBrowserLayoutTab),
  folders: Schema.Array(RomeBrowserLayoutFolder),
  splits: Schema.Array(RomeBrowserLayoutSplit),
  view: RomeBrowserLayoutView,
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

const SplitRows = Schema.Array(Schema.Array(ItemRef)).annotate({
  description:
    "A layout: one or two rows, top first, of one to three panes each, left to right. A folder fills in its tabs.",
});

export const RomeBrowserSplitInput = Schema.Struct({
  action: Schema.Literals([
    "create",
    "add",
    "remove",
    "arrange",
    "resize",
    "open",
    "separate",
    "rename",
    "collapse",
    "expand",
  ]).annotate({
    description:
      "create makes a split from members or rows (tabs only is fine); add puts members beside a chat or tab, in its split or a new one; remove takes members out; arrange lays an existing split out as rows (members left out leave it); resize sets pane and row sizes; open shows a split on screen; separate ends it; rename names it; collapse and expand fold its box in the sidebar.",
  }),
  splitId: Schema.optional(
    Schema.String.annotate({
      description: "For arrange, resize, open, separate, rename, collapse and expand.",
    }),
  ),
  members: Schema.optional(
    Schema.Array(ItemRef).annotate({
      description:
        "For create, add and remove: tabs and chats; a folder means its tabs. create lays them out two rows of three at most, evenly.",
    }),
  ),
  rows: Schema.optional(SplitRows),
  beside: Schema.optional(
    ItemRef.annotate({
      description:
        "For add: the chat or tab to go beside; a tab in no split starts a split of tabs. Defaults to this chat.",
    }),
  ),
  side: Schema.optional(
    Schema.Literals(["left", "right", "top", "bottom"]).annotate({
      description: "For add: which side of `beside`. Left out, members go wherever there's room.",
    }),
  ),
  sizes: Schema.optional(
    Schema.Struct({
      rows: Schema.optional(
        Schema.Array(Schema.Number).annotate({
          description: "Each row's share of the height, top first, as relative numbers.",
        }),
      ),
      columns: Schema.optional(
        Schema.Array(Schema.Array(Schema.Number)).annotate({
          description: "Each pane's share of its row's width, by row, as relative numbers.",
        }),
      ),
    }).annotate({
      description: "For resize; left out (or a part left out) makes those sizes even.",
    }),
  ),
  name: Schema.optional(
    Schema.String.annotate({
      description: 'For create and rename; blank goes back to "Split view".',
    }),
  ),
  show: Schema.optional(
    Schema.Boolean.annotate({
      description: "For create, add and arrange: also show the split on screen (default false).",
    }),
  ),
});
export type RomeBrowserSplitInput = typeof RomeBrowserSplitInput.Type;

export const RomeBrowserViewInput = Schema.Struct({
  show: Schema.String.annotate({
    description:
      "What to put on screen: `chat:<threadId>`, `tab:<browserTabId>`, `split:<splitId>`, `folder:<folderId>` (the folder as a page), `browser` (the browser on its own) or `new` (the new chat screen).",
  }),
});
export type RomeBrowserViewInput = typeof RomeBrowserViewInput.Type;

export const RomeBrowserFolderInput = Schema.Struct({
  action: Schema.Literals([
    "create",
    "rename",
    "customize",
    "add",
    "remove",
    "ungroup",
    "delete",
    "collapse",
    "expand",
  ]).annotate({
    description:
      "customize sets its name, emoji or colour; add files items into the folder (tabs in folders are pinned); remove takes them out; ungroup removes the folder and keeps what it held; delete removes it and closes its tabs.",
  }),
  folderId: Schema.optional(Schema.String),
  name: Schema.optional(
    Schema.String.annotate({ description: "For create, rename and customize." }),
  ),
  icon: Schema.optional(
    Schema.NullOr(Schema.String).annotate({
      description: "For create and customize: an emoji; null for a plain folder.",
    }),
  ),
  color: Schema.optional(
    Schema.NullOr(Schema.String).annotate({
      description: "For create and customize: one of browser_layout's spaceColors; null for none.",
    }),
  ),
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
