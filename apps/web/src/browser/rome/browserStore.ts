import type { RomeBrowser, RomeTab } from "@t3-ardia/entry";
import { flushSync } from "react-dom";
import { create } from "zustand";

import { ardiaAvailable, loadArdia } from "../ardia/ardiaHostStore";
import { splitTabKey, useSplitViewStore } from "../../splitViewStore";
import { folderItem, useFolderStore } from "./folderStore";

/** The browser's spaces and tabs as the app's own UI draws them; null until it loads. */
export const useBrowserModel = create<{ readonly browser: RomeBrowser | null }>()(() => ({
  browser: null,
}));

let actions: typeof import("@t3-ardia/entry") | null = null;

/** The browser's actions once it has loaded; calls before that do nothing. */
export const browser = () => actions;

let started = false;
export function startBrowserModel() {
  if (started || !ardiaAvailable) return;
  started = true;
  void loadArdia().then((module) => {
    actions = module;
    module.watchBrowser((model) => {
      const before = useBrowserModel.getState().browser;
      useBrowserModel.setState({ browser: model });
      // A closed tab leaves its folder and its split; another window's tabs don't count.
      if (!before || before.windowId === null || before.windowId !== model.windowId) return;
      for (const id of Object.keys(before.tabs)) {
        if (model.tabs[id]) continue;
        useFolderStore.getState().release(folderItem.tab(id));
        useSplitViewStore.getState().leave(splitTabKey(id));
      }
    });
  });
}

const EMPTY: readonly string[] = [];

export const useCurrentSpace = () =>
  useBrowserModel((state) => {
    const model = state.browser;
    return model?.spaces.find((space) => space.id === model.spaceId) ?? model?.spaces[0] ?? null;
  });

/** The current space's tab ids in order, pinned tabs first. */
export const useSpaceTabIds = () =>
  useBrowserModel((state) => {
    const model = state.browser;
    return (model?.spaceId && model.order[model.spaceId]) || EMPTY;
  });

export const useTab = (tabId: string): RomeTab | null =>
  useBrowserModel((state) => state.browser?.tabs[tabId] ?? null);

// How far, as a share of its width, the sidebar slides when the space changes.
const SLIDE_SHARE = 0.35;
const SLIDE_MS = 280;
const SLIDE_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

let switchingUntil = 0;

/** Whether a space change is sliding right now; other sidebar motion holds still meanwhile. */
export const isSwitchingSpace = () => performance.now() < switchingUntil;

/**
 * Changes space the way Arc does: what the sidebar shows (pinned tiles, folders,
 * tabs and chats) slides out to one side as one piece while the next space's
 * slides in from the other, all the same distance, on the same frames.
 */
export function switchSpaceAnimated(spaceId: string) {
  const model = useBrowserModel.getState().browser;
  const actions = browser();
  if (!model || !actions || model.spaceId === spaceId) return;
  const from = model.spaces.findIndex((space) => space.id === model.spaceId);
  const to = model.spaces.findIndex((space) => space.id === spaceId);
  const direction = to > from ? 1 : -1;
  const regions = [...document.querySelectorAll<HTMLElement>("[data-space-slide]")];
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || regions.length === 0) {
    actions.switchSpace(spaceId);
    return;
  }
  // Every region travels the same distance, so they stay lined up.
  const distance = Math.max(...regions.map((region) => region.offsetWidth)) * SLIDE_SHARE;
  const timing = { duration: SLIDE_MS, easing: SLIDE_EASING };
  switchingUntil = performance.now() + SLIDE_MS + 50;

  // A frozen copy of each region plays the old space leaving.
  const ghosts = regions.flatMap((region) => {
    const parent = region.parentElement;
    if (!parent) return [];
    // Positioned before measuring, so the copy's offsets are measured from it.
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    const ghost = region.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("data-space-slide");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    Object.assign(ghost.style, {
      position: "absolute",
      left: `${region.offsetLeft}px`,
      top: `${region.offsetTop}px`,
      width: `${region.offsetWidth}px`,
      height: `${region.offsetHeight}px`,
      pointerEvents: "none",
      margin: "0",
      overflow: "hidden",
    });
    parent.append(ghost);
    // Scrolling only takes once the copy is in the page.
    ghost.scrollTop = region.scrollTop;
    return [ghost];
  });

  // The next space renders now, so it slides in on the same frame the old one leaves.
  flushSync(() => actions.switchSpace(spaceId));
  for (const ghost of ghosts) {
    ghost
      .animate(
        [
          { transform: "translateX(0)", opacity: 1 },
          { transform: `translateX(${-direction * distance}px)`, opacity: 0 },
        ],
        { ...timing, fill: "forwards" },
      )
      .finished.finally(() => ghost.remove());
  }
  for (const region of document.querySelectorAll<HTMLElement>("[data-space-slide]")) {
    region.scrollTop = 0;
    region.animate(
      [
        { transform: `translateX(${direction * distance}px)`, opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      timing,
    );
  }
}
