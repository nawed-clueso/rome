import { lazy, Suspense, useLayoutEffect, type CSSProperties } from "react";

import { RenderErrorBoundary } from "../../components/RenderErrorBoundary";
import { useBrowserSurfaceStore } from "../browserSurfaceStore";
import { browser, useBrowserModel } from "../rome/browserStore";
import { useShownPagesStore } from "../rome/shownPagesStore";
import { ARDIA_SURFACE_ID, loadArdia, useArdiaHostStore } from "./ardiaHostStore";

const ArdiaBrowser = lazy(() => loadArdia().then((module) => ({ default: module.ArdiaBrowser })));

// Parked inside the window, behind everything: Electron stops drawing a guest page
// that sits wholly outside the window, and it then comes back showing a stale frame.
const PARKED: CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  width: 1024,
  height: 768,
  zIndex: -1,
  visibility: "hidden",
  pointerEvents: "none",
};

/**
 * Hosts the one Ardia window for the whole app. It sits outside the router, like
 * ElectronBrowserHost, so tabs keep running across thread switches; a panel's
 * ArdiaSurface only reports where the window should appear.
 */
/** Whether the page's top is its card's top, as when the address bar is in the sidebar. */
function startsAtCardTop(rect: { readonly y: number }): boolean {
  const card = document
    .querySelector(`[data-browser-surface-slot="${ARDIA_SURFACE_ID}"]`)
    ?.closest('[data-slot="sidebar-inset"]');
  return card ? Math.abs(card.getBoundingClientRect().top - rect.y) <= 2 : false;
}

export function ArdiaHost() {
  const requested = useArdiaHostStore((state) => state.requested);
  const presentation = useBrowserSurfaceStore((state) => state.byTabId[ARDIA_SURFACE_ID]);
  const ready = useBrowserModel((state) => state.browser !== null);
  // Pages shown in split panes are drawn from inside this host, so while any are,
  // the parked host can't sit behind the app; its own page goes unseen instead.
  const showingPages = useShownPagesStore((state) => state.tabIds.length > 0);
  const rect = presentation?.visible ? presentation.rect : null;
  const parked = rect === null;
  useLayoutEffect(() => {
    browser()?.setBrowserParked(parked);
  }, [parked, ready]);
  if (!requested) return null;
  const style: CSSProperties = rect
    ? {
        position: "fixed",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: presentation?.zIndex,
        // The page ends where its card does, so it takes the card's bottom corners, and
        // its top ones too when no toolbar sits above it.
        ...(presentation?.cornerRadius
          ? {
              borderBottomLeftRadius: presentation.cornerRadius,
              borderBottomRightRadius: presentation.cornerRadius,
              ...(startsAtCardTop(rect)
                ? {
                    borderTopLeftRadius: presentation.cornerRadius,
                    borderTopRightRadius: presentation.cornerRadius,
                  }
                : {}),
              overflow: "hidden",
            }
          : {}),
      }
    : showingPages
      ? { ...PARKED, zIndex: undefined }
      : PARKED;
  return (
    <div data-ardia-host style={style} aria-hidden={rect ? undefined : true}>
      {/* The host lives outside the router, so an error here would blank the whole app. */}
      <RenderErrorBoundary
        fallback={
          <div className="flex size-full items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
            The browser couldn't load. Reload the window to try again.
          </div>
        }
      >
        <Suspense fallback={null}>
          <ArdiaBrowser />
        </Suspense>
      </RenderErrorBoundary>
    </div>
  );
}
