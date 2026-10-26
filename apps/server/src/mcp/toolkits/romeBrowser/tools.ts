import {
  OrchestratorMcpFailure,
  PreviewAutomationError,
  RomeBrowserOpenInput,
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

export const RomeBrowserToolkit = Toolkit.make(BrowserTabsTool, BrowserOpenTool, BrowserUseTool);
