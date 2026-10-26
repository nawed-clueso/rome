// Two-finger swipes on a browser tab's page go back and forward, as in Arc. The
// page gets the trackpad's scroll events itself, never the app's window, so the
// tab's preload forwards the horizontal ones to the app (apps/web/ardia/rome/pageSwipe.ts)
// with whether the page could still scroll that way itself.

/** Marks a browser tab's preload, as an additional argument. */
export const ROME_TAB_ARGUMENT = "--rome-browser-tab";

/** The channel the app hears forwarded scrolls on (webviewPool's PAGE_WHEEL_CHANNEL). */
export const PAGE_WHEEL_CHANNEL = "rome:page-wheel";

/** How long after a forwarded scroll the following ones go too, so a gesture arrives whole. */
const FOLLOW_MS = 250;

type Send = (channel: string, payload: unknown) => void;

/** Whether something under `start` can still scroll left (`back`) or right. */
function scrollsWay(start: EventTarget | null, back: boolean): boolean {
  const root = document.scrollingElement;
  for (let node = start instanceof Element ? start : null; node; node = node.parentElement) {
    if (node.scrollWidth <= node.clientWidth + 1) continue;
    const overflow = getComputedStyle(node).overflowX;
    if (node !== root && overflow !== "auto" && overflow !== "scroll") continue;
    if (node === root && overflow === "hidden") continue;
    const left = Math.abs(node.scrollLeft);
    if (back ? left > 0.5 : left + node.clientWidth < node.scrollWidth - 0.5) return true;
  }
  return false;
}

/** Runs in the tab's preload: forwards horizontal trackpad scrolls to the app. */
export function forwardPageSwipes(send: Send) {
  let lastForwarded = -Infinity;
  window.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) return;
      const horizontal =
        Math.abs(event.deltaX) > 0 && Math.abs(event.deltaX) >= Math.abs(event.deltaY) / 2;
      if (!horizontal && event.timeStamp - lastForwarded > FOLLOW_MS) return;
      lastForwarded = event.timeStamp;
      const legacy = event as WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number };
      send(PAGE_WHEEL_CHANNEL, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        wheelDeltaX: legacy.wheelDeltaX,
        wheelDeltaY: legacy.wheelDeltaY,
        ctrlKey: event.ctrlKey,
        timeStamp: event.timeStamp,
        x: event.clientX,
        y: event.clientY,
        scrollsBack: scrollsWay(event.target, true),
        scrollsForward: scrollsWay(event.target, false),
      });
    },
    { capture: true, passive: true },
  );
}
