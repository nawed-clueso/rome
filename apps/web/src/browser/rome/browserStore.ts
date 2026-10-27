import type { RomeBrowser, RomeTab } from "@t3-ardia/entry";
import { flushSync } from "react-dom";
import { create } from "zustand";

import { ardiaAvailable, loadArdia } from "../ardia/ardiaHostStore";
import { splitTabKey, useSplitViewStore } from "../../splitViewStore";
import { folderItem, useFolderStore } from "./folderStore";
import { useTabMentionStore } from "./tabMentionStore";
import { syncStoresAcrossWindows } from "./windowSync";

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
  syncStoresAcrossWindows();
  void loadArdia().then((module) => {
    actions = module;
    module.watchBrowser((model) => {
      const before = useBrowserModel.getState().browser;
      useBrowserModel.setState({ browser: model });
      // A closed tab leaves its folder and its split; another window's tabs don't
      // count, nor do tabs that moved to another app window.
      if (!before || before.windowId === null || before.windowId !== model.windowId) return;
      for (const id of Object.keys(before.tabs)) {
        if (model.tabs[id] || module.wasHandedOff(id)) continue;
        useFolderStore.getState().release(folderItem.tab(id));
        useSplitViewStore.getState().leave(splitTabKey(id));
        useTabMentionStore.getState().forget(id);
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
// The fade a dragged space reaches by the time it has travelled the slide's distance.
const DRAG_FADE = 0.6;
// The leaving space is gone within this share of the slide, and the arriving one
// stays hidden for this share, so the two never show at once.
const LEAVE_SHARE = 0.4;
const ARRIVE_HOLD = 0.35;

let switchingUntil = 0;

/** Whether a space change is sliding right now; other sidebar motion holds still meanwhile. */
export const isSwitchingSpace = () => performance.now() < switchingUntil;

const slideRegions = () => [...document.querySelectorAll<HTMLElement>("[data-space-slide]")];
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How far the sidebar slides for a space change, in pixels. */
export const spaceSlideDistance = () =>
  Math.max(0, ...slideRegions().map((region) => region.offsetWidth)) * SLIDE_SHARE;

const dragOpacity = (offset: number) =>
  1 - Math.min(Math.abs(offset) / (spaceSlideDistance() || 1), 1) * DRAG_FADE;

/**
 * Holds the sidebar `offset` pixels to the side while a swipe is under way, so the
 * space follows the fingers; switchSpaceAnimated or settleSpaceDrag takes it from there.
 */
export function dragSpace(offset: number) {
  if (reducedMotion()) return;
  const opacity = String(dragOpacity(offset));
  for (const region of slideRegions()) {
    region.style.willChange = "transform, opacity";
    region.style.transform = `translateX(${offset}px)`;
    region.style.opacity = opacity;
  }
}

const releaseRegion = (region: HTMLElement) => {
  region.style.transform = "";
  region.style.opacity = "";
  region.style.willChange = "";
};

/** A swipe that didn't change space springs back from `offset`. */
export function settleSpaceDrag(offset: number) {
  for (const region of slideRegions()) {
    releaseRegion(region);
    if (!offset) continue;
    region.animate(
      [
        { transform: `translateX(${offset}px)`, opacity: dragOpacity(offset) },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 220, easing: SLIDE_EASING },
    );
  }
}

/**
 * Changes space the way Arc does: what the sidebar shows (pinned tiles, folders,
 * tabs and chats) slides out to one side as one piece while the next space's
 * slides in from the other, all the same distance, on the same frames. `fromOffset`
 * is where a swipe left the sidebar, so the slide carries on from the fingers.
 */
export function switchSpaceAnimated(spaceId: string, fromOffset = 0) {
  const model = useBrowserModel.getState().browser;
  const actions = browser();
  if (!model || !actions || model.spaceId === spaceId) return;
  const regions = slideRegions();
  // A space open in another window brings that window forward; nothing slides here.
  if (model.elsewhere[spaceId] || reducedMotion() || regions.length === 0) {
    for (const region of regions) releaseRegion(region);
    actions.switchSpace(spaceId);
    return;
  }
  const from = model.spaces.findIndex((space) => space.id === model.spaceId);
  const to = model.spaces.findIndex((space) => space.id === spaceId);
  const direction = to > from ? 1 : -1;
  // Every region travels the same distance, so they stay lined up.
  const distance = spaceSlideDistance();
  // A swipe already part way there finishes in the time the rest of the way takes.
  const left = Math.max(0.35, 1 - Math.min(Math.abs(fromOffset) / (distance || 1), 1));
  const duration = Math.round(SLIDE_MS * left);
  switchingUntil = performance.now() + duration + SLIDE_MS + 50;

  // A frozen copy of each region plays the old space leaving, carrying on from the swipe.
  for (const region of regions) {
    const parent = region.parentElement;
    if (!parent) continue;
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
      transform: "",
      opacity: "",
      willChange: "transform, opacity",
    });
    parent.append(ghost);
    // Scrolling only takes once the copy is in the page.
    ghost.scrollTop = region.scrollTop;
    ghost.animate(
      [
        { transform: `translateX(${fromOffset}px)` },
        { transform: `translateX(${-direction * distance}px)` },
      ],
      { duration, easing: SLIDE_EASING, fill: "forwards" },
    );
    // It fades out early in the slide, before the next space shows, and goes once unseen.
    ghost
      .animate([{ opacity: dragOpacity(fromOffset) }, { opacity: 0 }], {
        duration: Math.round(duration * LEAVE_SHARE),
        easing: "ease-out",
        fill: "forwards",
      })
      .finished.finally(() => ghost.remove());
    // The real region waits out of sight until the next space is in it.
    region.style.transform = "";
    region.style.opacity = "0";
  }

  // The window's tint crossfades: the old one, copied onto a layer under the
  // sidebar's content, fades out over the next space's.
  const wrapper = document.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]');
  const backdrop = wrapper ? getComputedStyle(wrapper).backgroundImage : "none";
  if (wrapper && backdrop && backdrop !== "none") {
    const layer = document.createElement("div");
    Object.assign(layer.style, {
      position: "absolute",
      inset: "0",
      zIndex: "-1",
      pointerEvents: "none",
      backgroundImage: backdrop,
    });
    layer.dataset.spaceTintLayer = "";
    // Isolated only while the layer is there, so it sits under the wrapper's content.
    // Kept on, it would trap the sidebar under the page when the sidebar peeks.
    wrapper.style.isolation = "isolate";
    wrapper.prepend(layer);
    layer
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: SLIDE_MS + 80, easing: "ease" })
      .finished.finally(() => {
        layer.remove();
        if (!wrapper.querySelector(":scope > [data-space-tint-layer]"))
          wrapper.style.isolation = "";
      });
  }

  // The copies start moving on the compositor first; the next space renders after,
  // so its render never holds the slide still.
  requestAnimationFrame(() =>
    setTimeout(() => {
      flushSync(() => actions.switchSpace(spaceId));
      for (const region of slideRegions()) {
        releaseRegion(region);
        region.scrollTop = 0;
        region.animate(
          [{ transform: `translateX(${direction * distance}px)` }, { transform: "translateX(0)" }],
          { duration: SLIDE_MS, easing: SLIDE_EASING },
        );
        region.animate(
          [{ opacity: 0 }, { opacity: 0, offset: ARRIVE_HOLD, easing: "ease-out" }, { opacity: 1 }],
          { duration: SLIDE_MS },
        );
      }
    }, 0),
  );
}
