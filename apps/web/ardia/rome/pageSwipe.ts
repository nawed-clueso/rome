import { addSwipeTarget, feedWheel, type SwipeTarget } from "../shims/web/motion/swipe";
import { onPageWheel } from "../shims/web/webviewPool";
import { pageAction, type RomeBrowser, watchBrowser } from "./model";

// Two-finger swipes on a page, as in Arc and Safari: back and forward through the
// tab's history. Pages get the trackpad's events themselves, so their preload forwards
// them here, and Ardia's gesture tracking (motion/swipe) reads them.

/** How far the fingers travel, in pixels, to commit a swipe. */
const COMMIT_DISTANCE = 120;

export type PageSwipeAction = "back" | "forward";

export type PageSwipe = {
  readonly tabId: string;
  readonly phase: "began" | "changed" | "ended" | "cancelled";
  /** Which edge the indicator comes from: back swipes from the left. */
  readonly side: "left" | "right";
  /** 0 to 1 as the swipe nears commit; 1 or more commits on release. */
  readonly progress: number;
  /** What a release would do now; null where nothing can happen that way. */
  readonly action: PageSwipeAction | null;
  /** The page's box, in window coordinates. */
  readonly rect: { left: number; top: number; width: number; height: number };
};

type ForwardedWheel = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  wheelDeltaX?: number;
  wheelDeltaY?: number;
  ctrlKey: boolean;
  timeStamp: number;
  x: number;
  y: number;
  scrollsBack: boolean;
  scrollsForward: boolean;
};

const listeners = new Set<(swipe: PageSwipe) => void>();
let browser: RomeBrowser | null = null;
const targets = new Map<string, { target: SwipeTarget; view: HTMLElement; stop: () => void }>();

function actionFor(tabId: string, back: boolean): PageSwipeAction | null {
  const tab = browser?.tabs[tabId];
  if (!tab) return null;
  if (back ? tab.canGoBack : tab.canGoForward) return back ? "back" : "forward";
  return null;
}

function emit(swipe: PageSwipe) {
  for (const listener of listeners) listener(swipe);
}

function targetFor(tabId: string, view: HTMLElement): SwipeTarget {
  const known = targets.get(tabId);
  if (known && known.view === view) return known.target;
  known?.stop();
  const rectOf = () => {
    const r = view.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };
  const target: SwipeTarget = {
    node: () => (view.isConnected ? view : null),
    canSwipeBack: () => actionFor(tabId, true) !== null,
    canSwipeForward: () => actionFor(tabId, false) !== null,
    // Tracked either way, so a swipe with nowhere to go still shows it can't.
    tracksUnavailableDirections: () => true,
    allowsVerticalMotion: () => false,
    isPager: () => false,
    pager: () => null,
    onSwipe: (event) => {
      if (event.phase === "wheel" || event.phase === "swipe") return;
      const back = event.direction === "back";
      const action = actionFor(tabId, back);
      const progress = Math.max(0, event.distance) / COMMIT_DISTANCE;
      emit({
        tabId,
        phase: event.phase,
        side: back ? "left" : "right",
        progress,
        action,
        rect: rectOf(),
      });
      if (event.phase === "ended" && action && progress >= 1) pageAction(tabId, action);
    },
  };
  const stop = addSwipeTarget(target);
  targets.set(tabId, { target, view, stop });
  return target;
}

let installed = false;
function install() {
  if (installed) return;
  installed = true;
  watchBrowser((next) => {
    browser = next;
    for (const [tabId, entry] of targets) {
      if (next.tabs[tabId]) continue;
      entry.stop();
      targets.delete(tabId);
    }
  });
  onPageWheel((tabId, view, input) => {
    const wheel = input as ForwardedWheel | null;
    if (!wheel || typeof wheel.deltaX !== "number") return;
    targetFor(tabId, view);
    // The page's own coordinates, moved into the window's.
    const r = view.getBoundingClientRect();
    feedWheel({
      deltaX: wheel.deltaX,
      deltaY: wheel.deltaY,
      deltaMode: wheel.deltaMode,
      wheelDeltaX: wheel.wheelDeltaX,
      wheelDeltaY: wheel.wheelDeltaY,
      ctrlKey: wheel.ctrlKey,
      timeStamp: wheel.timeStamp,
      clientX: r.left + wheel.x,
      clientY: r.top + wheel.y,
      target: view,
      scrolls: { back: wheel.scrollsBack, forward: wheel.scrollsForward },
      preventDefault: () => {},
    });
  });
}

/** Hears page swipes as they happen, to draw them; returns a function that stops. */
export function onPageSwipe(listener: (swipe: PageSwipe) => void): () => void {
  install();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
