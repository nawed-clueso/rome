import type { BrowserState } from "@ardia-app/store/browser";

export * from "@ardia-app/components/layout/windowLayout.ts?ardia-original";

// T3 Code draws the page's back, forward and address controls itself, so the page
// card never shows Ardia's toolbar: Ardia keeps its address field "in the sidebar",
// which T3 Code doesn't render, and always lays tabs out down the side.

export function useTabLayout(): "sidebar" | "top" {
  return "sidebar";
}

export function addressBarInSidebar(s: BrowserState, windowId: string): boolean {
  return !!s.windows[windowId];
}

export function useAddressBarInSidebar(): boolean {
  return true;
}
