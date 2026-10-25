import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { isMacPlatform } from "~/lib/utils";
import { useSidebar } from "../../components/ui/sidebar";
import { isElectron } from "../../env";
import { useAddressBarStore, useShownTabStore, useSidebarPeekStore } from "./addressBarStore";
import { browser } from "./browserStore";

const canHideWindowControls =
  isElectron && typeof navigator !== "undefined" && isMacPlatform(navigator.platform);

/**
 * Whether a page fills the window with nothing over it, as Arc shows one with its
 * sidebar away: the address lives in the sidebar, the sidebar is hidden and not
 * peeking, and the browse page is on screen. The window buttons and the sidebar
 * toggle step aside until the sidebar comes back.
 */
export function useChromeless(): boolean {
  const place = useAddressBarStore((state) => state.place);
  const { open, isMobile } = useSidebar();
  const peeking = useSidebarPeekStore((state) => state.peeking);
  const onBrowse = useLocation({ select: (location) => location.pathname === "/browse" });
  const showingPage = useShownTabStore((state) => state.tabId !== null);
  return (
    canHideWindowControls &&
    place === "sidebar" &&
    !open &&
    !isMobile &&
    !peeking &&
    onBrowse &&
    showingPage
  );
}

/** Whether pages lose their header when the address is in the sidebar (only where the window buttons can hide). */
export const pagesCanGoChromeless = canHideWindowControls;

/** Hides the window buttons while a page fills the window, and keeps its top edge draggable. */
export function ChromelessWindow() {
  const chromeless = useChromeless();
  useEffect(() => {
    browser()?.setWindowControlsVisible(!chromeless);
    return () => browser()?.setWindowControlsVisible(true);
  }, [chromeless]);
  if (!chromeless) return null;
  return <div aria-hidden className="drag-region fixed inset-x-0 top-0 z-40 h-2" />;
}
