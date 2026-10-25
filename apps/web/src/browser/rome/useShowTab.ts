import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import type { RomeTab } from "@t3-ardia/entry";
import { useNavigate } from "@tanstack/react-router";

import { useRightPanelStore } from "../../rightPanelStore";
import { buildThreadRouteParams } from "../../threadRoutes";
import { browser } from "./browserStore";

/** Shows a tab where it lives: its thread with the browser beside it, or the browser on its own. */
export function useShowTab() {
  const navigate = useNavigate();
  return (tab: Pick<RomeTab, "id" | "owner">) => {
    browser()?.activateTab(tab.id);
    const threadRef = tab.owner ? parseScopedThreadKey(tab.owner) : null;
    if (threadRef) {
      useRightPanelStore.getState().open(threadRef, "ardia");
      void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(threadRef) });
      return;
    }
    void navigate({ to: "/browse" });
  };
}
