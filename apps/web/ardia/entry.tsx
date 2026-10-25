import "./ardia.css";
import { useLayoutEffect, useRef } from "react";
import { unstable_batchedUpdates } from "react-native";
import { WindowRoot } from "@ardia-app/App";
import { startNativeSync } from "@ardia-app/lib/native";
import { startPersistence } from "@ardia-app/lib/persist";
import { startTabLifecycle } from "@ardia-app/lib/tabLifecycle";
import { startTabPages } from "@ardia-app/lib/tabPages";
import { setStoreBatching, useBrowser } from "@ardia-app/store/browser";
import { activeTab } from "@ardia-app/store/model";
import "./shims/web/diaImport";
import { DialogHost } from "./shims/web/dialogs";
import { MenuHost } from "./shims/web/menus";
import { setShortcutScope } from "./shims/web/motion/shortcuts";
import { UtilityWindowHost } from "./shims/web/utilityWindows";
import { attachPool } from "./shims/web/webviewPool";

import { requestSidebarToggle } from "./rome";
import { startPictures } from "./rome/model";
import { startHistory } from "./rome/search";

export { onSidebarToggle, onTabOpened, setCloseHandler, setNewTabHandler } from "./rome";
export {
  SPACE_COLORS,
  createSpace,
  updateSpace,
  activateTab,
  bringBackThreadTabs,
  cancelPickInTab,
  pickInTab,
  snapshotTab,
  setWindowControlsVisible,
  closeTab,
  forgetThreadTabs,
  navigateTab,
  openTab,
  pageAction,
  putAwayThreadTabs,
  setBrowsingFor,
  setBrowserParked,
  setPinned,
  showTabAt,
  startPictures,
  switchSpace,
  tabEngine,
  tabPicture,
  watchBrowser,
} from "./rome/model";
export type { RomeBrowser, RomeSpace, RomeTab, SavedTab } from "./rome/model";
export { addressFor, searchEngineName, suggest } from "./rome/search";
export type { Suggestion } from "./rome/search";

setStoreBatching(unstable_batchedUpdates);
startPersistence();
startTabPages();
startNativeSync();
startTabLifecycle();
startHistory();
startPictures();
if (!useBrowser.getState().windowOrder.length) useBrowser.getState().createWindow();
useBrowser.setState({ toggleSidebar: requestSidebarToggle });

Object.assign(globalThis, { ardia: { store: useBrowser } });

const useFocusedWindowId = () =>
  useBrowser((s) => {
    const id = s.ui.focusedWindowId ?? s.windowOrder[0];
    return id && s.windows[id] ? id : null;
  });

const focusedWindow = () => {
  const s = useBrowser.getState();
  const id = s.ui.focusedWindowId ?? s.windowOrder[0];
  return id && s.windows[id] ? id : null;
};

export type ArdiaActivePage = { title: string; url: string; favicon: string | null };

/** Calls `listener` with the page the browser is showing, now and whenever it changes. */
export function watchActivePage(listener: (page: ArdiaActivePage | null) => void): () => void {
  let last = "";
  const emit = () => {
    const windowId = focusedWindow();
    const tab = windowId ? activeTab(useBrowser.getState(), windowId) : undefined;
    const page = tab?.url
      ? { title: tab.customTitle || tab.title, url: tab.url, favicon: tab.favicon }
      : null;
    const key = JSON.stringify(page);
    if (key === last) return;
    last = key;
    listener(page);
  };
  emit();
  return useBrowser.subscribe(emit);
}

/** Opens `url` in a new foreground tab of the current space. */
export function openUrl(url: string) {
  const windowId = focusedWindow() ?? useBrowser.getState().createWindow();
  useBrowser.getState().newTab(windowId, { url });
}

/** The whole Ardia window: sidebar, spaces and tab content. Mount it once. */
export function ArdiaBrowser() {
  const root = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    attachPool(element);
    setShortcutScope(element);
    return () => setShortcutScope(null);
  }, []);
  return (
    <div ref={root} className="ardia-window">
      <WindowRoot />
      <MenuHost />
      <UtilityWindowHost />
      <DialogHost />
    </div>
  );
}
