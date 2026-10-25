import {
  switchFromBar as switchInBrowser,
  type Disposition,
} from "@ardia-app/components/omnibox/open.ts?ardia-original";
import { noteTabOpened } from "../rome";

export * from "@ardia-app/components/omnibox/open.ts?ardia-original";

/** Picking an open tab from a bar also brings up the thread or page it lives in. */
export function switchFromBar(
  targetTabId: string,
  url: string,
  barTabId: string,
  disposition: Disposition,
) {
  switchInBrowser(targetTabId, url, barTabId, disposition);
  if (disposition === "current") noteTabOpened(targetTabId);
}
