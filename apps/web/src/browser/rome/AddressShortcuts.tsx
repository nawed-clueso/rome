import { useEffect, useEffectEvent } from "react";

import { toastManager } from "~/components/ui/toast";
import { openNewScreen } from "../../newScreenStore";
import { ardiaAvailable, loadArdia } from "../ardia/ardiaHostStore";
import { requestAddressEdit, useShownTabStore } from "./addressBarStore";
import { useBrowserModel } from "./browserStore";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

/** The tab on screen, or null when no page is. */
const shownTab = () => {
  const tabId = useShownTabStore.getState().tabId;
  return tabId ? (useBrowserModel.getState().browser?.tabs[tabId] ?? null) : null;
};

/**
 * Arc's address keys, wherever focus is: Cmd+L edits the shown page's address
 * with all of it selected (or opens the New screen when no page is shown), and
 * Cmd+Option+C or Cmd+Shift+C copies the page's link.
 */
export function AddressShortcuts() {
  const editAddress = useEffectEvent((): boolean => {
    const tab = shownTab();
    if (tab) requestAddressEdit(tab.id);
    else openNewScreen("browse");
    return true;
  });
  const copyUrl = useEffectEvent((): boolean => {
    const tab = shownTab();
    if (!tab?.url) return false;
    void navigator.clipboard.writeText(tab.url).then(
      () => toastManager.add({ type: "success", title: "Copied link", description: tab.url }),
      () => toastManager.add({ type: "error", title: "Couldn't copy the link" }),
    );
    return true;
  });

  useEffect(() => {
    // Keys the browser didn't take (its own handler runs first while a page or the
    // browser has focus, and marks what it handled).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!mod) return;
      if (event.code === "KeyL" && !event.altKey && !event.shiftKey) {
        if (editAddress()) event.preventDefault();
      } else if (event.code === "KeyC" && event.altKey !== event.shiftKey) {
        if (copyUrl()) event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    let stopped = false;
    let stopAddress = () => {};
    let stopCopy = () => {};
    if (ardiaAvailable) {
      void loadArdia().then((module) => {
        if (stopped) return;
        stopAddress = module.setAddressHandler(() => editAddress());
        stopCopy = module.setCopyUrlHandler(() => copyUrl());
      });
    }
    return () => {
      stopped = true;
      window.removeEventListener("keydown", onKeyDown);
      stopAddress();
      stopCopy();
    };
  }, []);

  return null;
}
