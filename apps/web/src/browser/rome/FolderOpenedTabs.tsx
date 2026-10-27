import { useEffect } from "react";

import { fileItem } from "./folderActions";
import { filedItems, folderItem, useFolderStore } from "./folderStore";
import { useBrowserModel } from "./browserStore";

/**
 * A link opened from a tab in a folder (Cmd-click, or a link that opens a new
 * window) lands in the same folder, right after the tab it came from.
 */
export function FolderOpenedTabs() {
  useEffect(() => {
    let known: Set<string> | null = null;
    return useBrowserModel.subscribe((state) => {
      const tabs = state.browser?.tabs;
      if (!tabs) return;
      const ids = Object.keys(tabs);
      // The tabs there at start are not new.
      if (!known) {
        known = new Set(ids);
        return;
      }
      for (const id of ids) {
        if (known.has(id)) continue;
        known.add(id);
        const tab = tabs[id]!;
        if (!tab.openerId) continue;
        const { folders } = useFolderStore.getState();
        const folderId = filedItems(folders).get(folderItem.tab(tab.openerId));
        const folder = folderId ? folders[folderId] : undefined;
        if (!folder || folder.spaceId !== tab.spaceId) continue;
        const at = folder.items.indexOf(folderItem.tab(tab.openerId));
        fileItem(folderItem.tab(id), {
          spaceId: folder.spaceId,
          folderId: folder.id,
          before: folder.items[at + 1] ?? null,
        });
      }
      for (const id of known) if (!tabs[id]) known.delete(id);
    });
  }, []);
  return null;
}
