import * as Schema from "effect/Schema";

import { ThreadId } from "./baseSchemas.ts";

/**
 * Rome's browser, as an agent reaches it. The server asks the Rome app, which
 * holds the user's tabs, and the app answers: list a chat's tabs, open a page as a
 * real tab under the chat, or make one of its tabs ready for the preview tools.
 */
export const RomeBrowserOperation = Schema.Literals(["tabs", "open", "use"]);
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
