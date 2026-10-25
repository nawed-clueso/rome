import type { RomeBrowser } from "@t3-ardia/entry";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { BrowserSurfaceSlot } from "../BrowserSurfaceSlot";
import { browser, useBrowserModel } from "../rome/browserStore";
import { useAddressBarStore, useShownTabStore } from "../rome/addressBarStore";
import { PageHeader } from "../rome/PageHeader";
import { useSidebar } from "../../components/ui/sidebar";
import { pagesCanGoChromeless } from "../rome/ChromelessWindow";
import { SearchField } from "../rome/SearchField";
import { ARDIA_SURFACE_ID, useArdiaHostStore } from "./ardiaHostStore";

// Sheets sit at --z-sheet (46); dialogs and popovers start at 50.
const SHEET_Z_INDEX = 47;

/**
 * The tab a surface should show: for a thread, the tab it was last on; on its own,
 * the space's last tab that belongs to no thread. Null when there is none yet,
 * undefined while the browser loads.
 */
function tabToShow(model: RomeBrowser | null, owner: string | null): string | null | undefined {
  if (!model?.spaceId) return undefined;
  const shown = model.tabs[model.active[model.spaceId] ?? ""];
  if (shown?.url && shown.owner === owner) return shown.id;
  const candidates = Object.values(model.tabs).filter(
    (tab) => tab.url && tab.owner === owner && (owner !== null || tab.spaceId === model.spaceId),
  );
  candidates.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  return candidates[0]?.id ?? null;
}

/**
 * Where the shared browser window appears: a thread's side panel (`owner` is the
 * thread's key, and tabs opened there belong to it) or the browser page (`owner`
 * null). With nothing to show yet it offers a search field instead.
 */
export function ArdiaSurface(props: {
  readonly visible: boolean;
  readonly owner?: string | null;
  /** Rounds the page's bottom corners where it meets the edge of its card. */
  readonly cornerRadius?: number;
}) {
  const owner = props.owner ?? null;
  const request = useArdiaHostStore((state) => state.request);
  useEffect(() => request(), [request]);
  const tabId = useBrowserModel((state) => tabToShow(state.browser, owner));
  const activeId = useBrowserModel((state) =>
    state.browser?.spaceId ? (state.browser.active[state.browser.spaceId] ?? null) : null,
  );

  useEffect(() => {
    if (!props.visible) return;
    browser()?.setBrowsingFor(owner);
    return () => browser()?.setBrowsingFor(null);
  }, [props.visible, owner]);

  useEffect(() => {
    if (props.visible && tabId && tabId !== activeId) browser()?.activateTab(tabId);
  }, [props.visible, tabId, activeId]);

  // The sidebar's address follows the page on screen.
  const addressPlace = useAddressBarStore((state) => state.place);
  // The address only lives in the sidebar while the sidebar is showing; with it
  // hidden, the page keeps its own header (and clears the window controls).
  // Where the window buttons can step aside (macOS), the page fills the window
  // instead (ChromelessWindow).
  const { open: sidebarOpen, isMobile } = useSidebar();
  const showHeader = addressPlace === "page" || isMobile || (!sidebarOpen && !pagesCanGoChromeless);
  useEffect(() => {
    if (!props.visible || !tabId) return;
    useShownTabStore.setState({ tabId });
    return () => {
      if (useShownTabStore.getState().tabId === tabId) useShownTabStore.setState({ tabId: null });
    };
  }, [props.visible, tabId]);

  const frame = useRef<HTMLDivElement | null>(null);
  const [inSheet, setInSheet] = useState(false);
  useLayoutEffect(() => {
    setInSheet(!!frame.current?.closest('[data-slot="sheet-viewport"]'));
  }, []);

  if (tabId === null) {
    return (
      <div className="flex size-full min-h-0 min-w-0 items-start justify-center overflow-auto px-6 pt-[18vh]">
        <div className="w-full max-w-xl">
          <SearchField owner={owner} autoFocus={props.visible} />
        </div>
      </div>
    );
  }
  return (
    <div ref={frame} className="flex size-full min-h-0 min-w-0 flex-col">
      {tabId && showHeader ? (
        <PageHeader
          tabId={tabId}
          titleBar={owner === null}
          {...(owner === null ? { onClose: () => browser()?.closeTab(tabId) } : {})}
        />
      ) : null}
      <BrowserSurfaceSlot
        tabId={ARDIA_SURFACE_ID}
        visible={props.visible}
        className="min-h-0 min-w-0 flex-1"
        {...(inSheet ? { zIndex: SHEET_Z_INDEX } : {})}
        {...(props.cornerRadius ? { cornerRadius: props.cornerRadius } : {})}
      />
    </div>
  );
}
