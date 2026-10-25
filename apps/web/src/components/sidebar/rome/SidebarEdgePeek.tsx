import { useEffect, useRef, useState } from "react";

import { useSidebarPeekStore } from "../../../browser/rome/addressBarStore";
import { useSidebar } from "../../ui/sidebar";

// How long the pointer may be away from a peeking sidebar before it slides back.
const LEAVE_DELAY_MS = 350;

const sidebarElement = () => document.querySelector<HTMLElement>('[data-slot="sidebar"]');
const menuOpen = () =>
  document.querySelector('[role="menu"], [role="listbox"][data-open]') !== null;

/**
 * With the sidebar hidden, resting the pointer on the window's left edge slides it
 * in over the content, as Arc does; moving away slides it back out.
 */
export function SidebarEdgePeek() {
  const { open, isMobile } = useSidebar();
  const [peekRequested, setPeeking] = useState(false);
  const leaveTimer = useRef(0);
  const hidden = !open && !isMobile;
  // Once the sidebar is shown for good, a peek asked for before is over, so hiding
  // it again doesn't slide it straight back out.
  const [wasHidden, setWasHidden] = useState(hidden);
  if (wasHidden !== hidden) {
    setWasHidden(hidden);
    if (!hidden) setPeeking(false);
  }
  const peeking = hidden && peekRequested;

  useEffect(() => {
    useSidebarPeekStore.setState({ peeking });
  }, [peeking]);

  useEffect(() => {
    const sidebar = sidebarElement();
    if (!sidebar) return;
    if (!peeking) return;
    // The hidden sidebar is inert; while it peeks it has to take clicks.
    sidebar.dataset.peek = "true";
    sidebar.removeAttribute("inert");
    const container = sidebar.querySelector<HTMLElement>('[data-slot="sidebar-container"]');
    const stay = () => window.clearTimeout(leaveTimer.current);
    const leave = () => {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(function check() {
        // The sidebar toggle sits over the peeking sidebar and counts as part of it.
        const overToggle =
          document.querySelector("[data-sidebar-control]")?.matches(":hover") ?? false;
        if (container?.matches(":hover") || overToggle || menuOpen()) {
          leaveTimer.current = window.setTimeout(check, LEAVE_DELAY_MS);
          return;
        }
        setPeeking(false);
      }, LEAVE_DELAY_MS);
    };
    container?.addEventListener("pointerenter", stay);
    container?.addEventListener("pointerleave", leave);
    return () => {
      window.clearTimeout(leaveTimer.current);
      container?.removeEventListener("pointerenter", stay);
      container?.removeEventListener("pointerleave", leave);
      delete sidebar.dataset.peek;
      if (sidebar.dataset.state === "collapsed") sidebar.setAttribute("inert", "");
    };
  }, [peeking]);

  if (!hidden || peeking) return null;
  return (
    <div
      aria-hidden
      data-sidebar-edge=""
      onPointerEnter={() => setPeeking(true)}
      className="fixed inset-y-0 left-0 z-[55] w-1.5"
    />
  );
}
