import {
  OrchestratorMcpFailure,
  PreviewAutomationError,
  RomeBrowserChangeResult,
  RomeBrowserFolderInput,
  RomeBrowserLayout,
  RomeBrowserOpenInput,
  RomeBrowserSpaceInput,
  RomeBrowserSplitInput,
  RomeBrowserTabInput,
  RomeBrowserReadyTab,
  RomeBrowserTabsResult,
  RomeBrowserUseInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as RomeBrowserBridge from "../../../preview/RomeBrowserBridge.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const shared = {
  failure: Schema.Union([PreviewAutomationError, OrchestratorMcpFailure]),
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    RomeBrowserBridge.RomeBrowserBridge,
  ],
};

const BrowserTabsTool = Tool.make("browser_tabs", {
  ...shared,
  description:
    "List the user's Rome browser tabs this chat can use: tabs opened from this chat and tabs the user mentioned in it. A tab with a tabId is ready for the preview tools; a sleeping one (tabId null) needs browser_use first.",
  parameters: Tool.EmptyParams,
  success: RomeBrowserTabsResult,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const BrowserOpenTool = Tool.make("browser_open", {
  ...shared,
  description:
    "Open a page as a real tab in the user's Rome browser, in this chat's space and signed in as the user. Returns a tabId for preview_snapshot, preview_click, preview_type and the other preview tools.",
  parameters: RomeBrowserOpenInput,
  success: RomeBrowserReadyTab,
}).annotate(Tool.Destructive, false);

const BrowserUseTool = Tool.make("browser_use", {
  ...shared,
  description:
    "Make one of this chat's Rome tabs ready for the preview tools, waking it if it's asleep. Returns its tabId.",
  parameters: RomeBrowserUseInput,
  success: RomeBrowserReadyTab,
}).annotate(Tool.Destructive, false);

const BrowserLayoutTool = Tool.make("browser_layout", {
  ...shared,
  description:
    "See how the user's Rome browser is arranged: its spaces, every tab in this window, folders and split views, with the ids the other browser_* tools take.",
  parameters: Tool.EmptyParams,
  success: RomeBrowserLayout,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const BrowserTabTool = Tool.make("browser_tab", {
  ...shared,
  description:
    "Manage the user's Rome tabs, any of them: focus, close, pin or unpin, navigate, go back or forward, reload, reorder, or move to another space. Only do what the user asked for.",
  parameters: RomeBrowserTabInput,
  success: RomeBrowserChangeResult,
}).annotate(Tool.Destructive, true);

const BrowserSplitTool = Tool.make("browser_split", {
  ...shared,
  description:
    "Arrange split views in Rome: show tabs or chats beside a chat, take them out, end a split or name it. Up to two rows of three.",
  parameters: RomeBrowserSplitInput,
  success: RomeBrowserChangeResult,
}).annotate(Tool.Destructive, false);

const BrowserFolderTool = Tool.make("browser_folder", {
  ...shared,
  description:
    "Manage folders in Rome's sidebar: create, rename, file tabs, chats or folders into one, take them out, collapse, ungroup or delete (which closes its tabs).",
  parameters: RomeBrowserFolderInput,
  success: RomeBrowserChangeResult,
}).annotate(Tool.Destructive, true);

const BrowserSpaceTool = Tool.make("browser_space", {
  ...shared,
  description:
    "Manage Rome's spaces: switch to one, create one, change its name, icon or colour, or move chats into a space.",
  parameters: RomeBrowserSpaceInput,
  success: RomeBrowserChangeResult,
}).annotate(Tool.Destructive, false);

export const RomeBrowserToolkit = Toolkit.make(
  BrowserTabsTool,
  BrowserOpenTool,
  BrowserUseTool,
  BrowserLayoutTool,
  BrowserTabTool,
  BrowserSplitTool,
  BrowserFolderTool,
  BrowserSpaceTool,
);
