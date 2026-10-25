import type { NewTabTarget } from "@ardia-app/store/types";
import { toggleNewTabBar as toggleArdiaNewTabBar } from "@ardia-app/components/omnibox/newTabBar.ts?ardia-original";
import { requestNewTab } from "../rome";

export * from "@ardia-app/components/omnibox/newTabBar.ts?ardia-original";

// Every way of asking for a new tab (Cmd+T, the New Tab row, menus) comes through
// here, so T3 Code's New screen can answer it in place of the browser's own bar.
export function toggleNewTabBar(
  windowId: string,
  target: NewTabTarget = { kind: "list" },
): boolean {
  return requestNewTab(windowId, target) || toggleArdiaNewTabBar(windowId, target);
}
