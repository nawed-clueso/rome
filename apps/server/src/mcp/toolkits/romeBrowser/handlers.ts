import {
  OrchestratorMcpFailure,
  RomeBrowserChangeResult,
  RomeBrowserLayout,
  RomeBrowserReadyTab,
  RomeBrowserTabsResult,
  type RomeBrowserOperation,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as RomeBrowserBridge from "../../../preview/RomeBrowserBridge.ts";
import { requireThreadMcpCapability } from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { RomeBrowserToolkit } from "./tools.ts";

const ask = Effect.fn("RomeBrowser.ask")(function* <A, I>(
  schema: Schema.Codec<A, I>,
  operation: RomeBrowserOperation,
  input: unknown,
) {
  const scope = yield* requireThreadMcpCapability("preview");
  const bridge = yield* RomeBrowserBridge.RomeBrowserBridge;
  const answer = yield* bridge
    .request(scope.thread.threadId, operation, input)
    .pipe(
      Effect.mapError(
        (error) =>
          new OrchestratorMcpFailure({ code: "orchestration_error", message: error.message }),
      ),
    );
  return yield* Schema.decodeUnknownEffect(schema)(answer).pipe(
    Effect.mapError(
      () =>
        new OrchestratorMcpFailure({
          code: "orchestration_error",
          message: "Rome's browser gave an answer the tool couldn't read.",
        }),
    ),
  );
});

export const layer = McpToolAccess.toLayer(RomeBrowserToolkit, {
  browser_tabs: McpToolAccess.readsAsCaller(() => ask(RomeBrowserTabsResult, "tabs", {})),
  browser_open: McpToolAccess.actsAsCaller((input) => ask(RomeBrowserReadyTab, "open", input)),
  browser_use: McpToolAccess.actsAsCaller((input) => ask(RomeBrowserReadyTab, "use", input)),
  browser_layout: McpToolAccess.readsAsCaller(() => ask(RomeBrowserLayout, "layout", {})),
  browser_tab: McpToolAccess.actsAsCaller((input) => ask(RomeBrowserChangeResult, "tab", input)),
  browser_split: McpToolAccess.actsAsCaller((input) =>
    ask(RomeBrowserChangeResult, "split", input),
  ),
  browser_folder: McpToolAccess.actsAsCaller((input) =>
    ask(RomeBrowserChangeResult, "folder", input),
  ),
  browser_space: McpToolAccess.actsAsCaller((input) =>
    ask(RomeBrowserChangeResult, "space", input),
  ),
});
