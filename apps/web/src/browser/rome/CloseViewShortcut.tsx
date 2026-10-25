import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useEffectEvent } from "react";

import { openNewScreen } from "../../newScreenStore";
import { readThreadShell } from "../../state/entities";
import { resolveThreadRouteRef } from "../../threadRoutes";
import { ardiaAvailable, loadArdia } from "../ardia/ardiaHostStore";
import { useShownTabStore } from "./addressBarStore";
import { browser, useBrowserModel } from "./browserStore";

// The views visited, newest last, for Cmd+W to go back through.
const MAX_HISTORY = 40;
const visited: string[] = [];

/** The space's other open pages, most recently used first. */
function otherTabs(closing: string) {
  const model = useBrowserModel.getState().browser;
  if (!model?.spaceId) return [];
  return Object.values(model.tabs)
    .filter((tab) => tab.id !== closing && tab.spaceId === model.spaceId && tab.url && !tab.owner)
    .toSorted((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/** Whether a visited path can still be shown. */
function stillThere(path: string) {
  if (path === "/browse")
    return Object.values(useBrowserModel.getState().browser?.tabs ?? {}).some((tab) => tab.url);
  const [, environmentId, threadId] = path.split("/");
  const ref =
    environmentId && threadId && environmentId !== "folder" && environmentId !== "settings"
      ? resolveThreadRouteRef({
          environmentId: decodeURIComponent(environmentId),
          threadId: decodeURIComponent(threadId),
        })
      : null;
  // Drafts are left behind once sent; a thread may have been deleted since.
  if (path.startsWith("/draft/")) return false;
  return ref ? readThreadShell(ref) !== null : true;
}

/**
 * Cmd+W never closes the window. On a page it closes that tab and shows the space's
 * next page; with nothing left there, or on a chat or any other view, it goes back
 * to the view open before, or to a new chat.
 */
export function CloseViewShortcut() {
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    if (visited.at(-1) === pathname) return;
    visited.push(pathname);
    if (visited.length > MAX_HISTORY) visited.shift();
  }, [pathname]);

  const goBack = () => {
    const current = router.state.location.pathname;
    while (visited.length && visited.at(-1) === current) visited.pop();
    while (visited.length) {
      const target = visited.at(-1)!;
      if (target !== current && stillThere(target)) {
        void router.navigate({ to: target as never });
        return;
      }
      visited.pop();
    }
    openNewScreen("chat");
  };

  const closePage = () => {
    const tabId = useShownTabStore.getState().tabId;
    if (!tabId) return false;
    const next = otherTabs(tabId)[0];
    browser()?.closeTab(tabId);
    // Off the browse page the tab sat in a chat's panel, which shows its next page itself.
    if (router.state.location.pathname !== "/browse") return true;
    if (next) browser()?.activateTab(next.id);
    else goBack();
    return true;
  };

  // From the menu (the app had focus) a page closes only on the browse page.
  const fromMenu = useEffectEvent(() => {
    if (router.state.location.pathname === "/browse" && closePage()) return;
    goBack();
  });
  // From a focused page, that page's tab closes.
  const fromPage = useEffectEvent(() => {
    if (!closePage()) goBack();
  });

  useEffect(() => {
    const stopMenu = window.desktopBridge?.onMenuAction((action) => {
      if (action === "rome.close-view") fromMenu();
    });
    let stopped = false;
    let stopPage = () => {};
    if (ardiaAvailable) {
      void loadArdia().then((module) => {
        if (!stopped) stopPage = module.setCloseHandler(() => fromPage());
      });
    }
    return () => {
      stopped = true;
      stopMenu?.();
      stopPage();
    };
  }, []);

  return null;
}
