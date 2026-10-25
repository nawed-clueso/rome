import { clickTab as selectTab } from "@ardia-app/components/sidebar/actions.ts?ardia-original";
import { noteTabOpened } from "../rome";

export * from "@ardia-app/components/sidebar/actions.ts?ardia-original";

/** A plain click also tells T3 Code, which brings up the thread or page the tab lives in. */
export function clickTab(
  windowId: string,
  tabId: string,
  mods: { metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
) {
  selectTab(windowId, tabId, mods);
  if (!mods.metaKey && !mods.shiftKey && !mods.altKey) noteTabOpened(tabId);
}
