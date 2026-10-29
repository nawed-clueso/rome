import type { RomeCommand } from "@t3-ardia/entry";
import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef } from "react";

import { newSpace } from "~/components/sidebar/rome/SpaceDialog";
import { toastManager } from "~/components/ui/toast";
import { useThreadRouteTarget } from "~/hooks/useThreadRouteTarget";
import { splitGroupOf, splitTabKey, useSplitViewStore } from "~/splitViewStore";
import { buildThreadRouteParams } from "~/threadRoutes";
import { ardiaAvailable, loadArdia } from "../ardia/ardiaHostStore";
import { useShownTabStore } from "./addressBarStore";
import { browser, switchSpaceAnimated, useBrowserModel } from "./browserStore";

/**
 * Arc's keys for spaces, pins and splits, which Rome answers itself: Cmd+Shift+N makes a
 * space, Cmd+Option+Left/Right moves between spaces, Cmd+D pins or unpins the page, and
 * Cmd+Option+= puts the page beside its chat (or this chat's latest page beside it).
 */
const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export function ArcShortcuts() {
  const navigate = useNavigate();
  const routeTarget = useThreadRouteTarget();
  const chatKey = routeTarget?.kind === "server" ? scopedThreadKey(routeTarget.threadRef) : null;

  const run = useEffectEvent((command: RomeCommand): boolean => {
    const actions = browser();
    const model = useBrowserModel.getState().browser;
    if (!actions || !model) return false;
    // The page on screen; with focus inside a page, the space's active tab is that page.
    const shownId =
      useShownTabStore.getState().tabId ?? (model.spaceId ? model.active[model.spaceId] : null);
    const shown = shownId ? (model.tabs[shownId] ?? null) : null;
    switch (command) {
      case "newSpace":
        newSpace();
        return true;
      case "nextSpace":
      case "previousSpace": {
        const index = model.spaces.findIndex((space) => space.id === model.spaceId);
        const next = model.spaces[index + (command === "nextSpace" ? 1 : -1)];
        if (next) switchSpaceAnimated(next.id);
        return true;
      }
      case "pinTab": {
        if (!shown) return false;
        actions.setPinned(shown.id, !shown.pinned);
        toastManager.add({
          type: "success",
          title: shown.pinned ? "Unpinned" : "Pinned",
          description: shown.title || shown.url,
        });
        return true;
      }
      case "splitView": {
        // The page beside the chat it came from, or, on a chat, its latest page beside it.
        const chat = shown?.owner ?? chatKey;
        const page =
          shown ?? Object.values(model.tabs).findLast((tab) => tab.owner === chat) ?? null;
        const ref = chat ? parseScopedThreadKey(chat) : null;
        if (!chat || !page || !ref) {
          toastManager.add({
            type: "info",
            title: "Nothing to split yet",
            description: "Open a page from a chat, then press it again to put them side by side.",
          });
          return true;
        }
        const store = useSplitViewStore.getState();
        const tabKey = splitTabKey(page.id);
        if (!splitGroupOf(store.groups, chat)?.rows.some((row) => row.includes(tabKey))) {
          if (!store.place(chat, tabKey, { target: chat, side: "right" })) store.join(chat, tabKey);
        }
        void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
        return true;
      }
    }
  });

  // With a chat or the app focused, the browser's own key handler doesn't run. Moving
  // between spaces and splitting work from anywhere; Cmd+D and Cmd+Shift+N keep the app's
  // meaning there (diff, new chat) and take Arc's only on a page.
  useEffect(() => {
    if (!ardiaAvailable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!mod || !event.altKey || event.shiftKey) return;
      const command: RomeCommand | null =
        event.code === "ArrowRight"
          ? "nextSpace"
          : event.code === "ArrowLeft"
            ? "previousSpace"
            : event.code === "Equal"
              ? "splitView"
              : null;
      if (command && run(command)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Registered once: the browser loads after this mounts, and the route changes often.
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    if (!ardiaAvailable) return;
    let stop: (() => void) | null = null;
    let stopped = false;
    void loadArdia().then((module) => {
      if (stopped) return;
      stop = module.setRomeCommandHandler((command) => latest.current(command));
    });
    return () => {
      stopped = true;
      stop?.();
    };
  }, []);

  return null;
}
