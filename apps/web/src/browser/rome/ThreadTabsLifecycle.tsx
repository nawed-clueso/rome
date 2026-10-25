import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useEffect, useRef } from "react";

import { useQuietThreadShells } from "../../state/entities";
import { browser, useBrowserModel } from "./browserStore";
import { folderItem, useFolderStore } from "./folderStore";

/**
 * Keeps a thread's tabs with the thread: settling it puts them away, un-settling
 * brings them back, and a thread that disappears lets its open tabs go free.
 */
export function ThreadTabsLifecycle() {
  const threads = useQuietThreadShells();
  const ready = useBrowserModel((state) => state.browser !== null);
  const seen = useRef<Map<string, boolean> | null>(null);
  useEffect(() => {
    const actions = browser();
    if (!ready || !actions || threads.length === 0) return;
    const now = new Map(
      threads.map((thread) => [
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        thread.settledOverride === "settled",
      ]),
    );
    const before = seen.current;
    seen.current = now;
    for (const [key, settled] of now) {
      const was = before?.get(key);
      // On the first pass, a thread that settled while the app was closed still
      // has its tabs open; put them away too.
      if (settled && was !== true) actions.putAwayThreadTabs(key);
      else if (!settled && was === true) actions.bringBackThreadTabs(key);
    }
    if (before) {
      for (const key of before.keys()) {
        if (now.has(key)) continue;
        actions.forgetThreadTabs(key);
        useFolderStore.getState().release(folderItem.thread(key));
      }
    }
  }, [threads, ready]);
  return null;
}
