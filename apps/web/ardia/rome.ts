// What the browser tells the rest of T3 Code, and what T3 Code lets it hand off.
// The sidebar overrides call in here; entry.tsx exports the subscriptions.

import type { NewTabTarget } from "@ardia-app/store/types";

export type { NewTabTarget };

type NewTabHandler = (windowId: string, target: NewTabTarget) => void;

let newTabHandler: NewTabHandler | null = null;
const tabOpenedListeners = new Set<(tabId: string) => void>();

/** New tabs start on T3 Code's New screen instead of the browser's own new-tab bar. */
export function setNewTabHandler(handler: NewTabHandler | null): () => void {
  newTabHandler = handler;
  return () => {
    if (newTabHandler === handler) newTabHandler = null;
  };
}

/** True when T3 Code took the request. */
export function requestNewTab(windowId: string, target: NewTabTarget): boolean {
  if (!newTabHandler) return false;
  newTabHandler(windowId, target);
  return true;
}

let newChatHandler: (() => void) | null = null;

/** Cmd+N on a page starts a chat in T3 Code instead of opening a browser window. */
export function setNewChatHandler(handler: (() => void) | null): () => void {
  newChatHandler = handler;
  return () => {
    if (newChatHandler === handler) newChatHandler = null;
  };
}

/** True when T3 Code took the request. */
export function requestNewChat(): boolean {
  if (!newChatHandler) return false;
  newChatHandler();
  return true;
}

/** Hears every tab the user opens from the sidebar, so the app can show where it lives. */
export function onTabOpened(listener: (tabId: string) => void): () => void {
  tabOpenedListeners.add(listener);
  return () => void tabOpenedListeners.delete(listener);
}

export function noteTabOpened(tabId: string) {
  for (const listener of tabOpenedListeners) listener(tabId);
}

const sidebarListeners = new Set<() => void>();

/**
 * The browser's own "toggle sidebar" (Cmd+S while a page has focus) toggles T3
 * Code's sidebar: the browser has none of its own here.
 */
export function onSidebarToggle(listener: () => void): () => void {
  sidebarListeners.add(listener);
  return () => void sidebarListeners.delete(listener);
}

export function requestSidebarToggle() {
  for (const listener of sidebarListeners) listener();
}

let addressHandler: (() => boolean) | null = null;

/** Lets the app answer Cmd+L (the page's address, as Arc edits it) while a page has focus. */
export function setAddressHandler(handler: (() => boolean) | null): () => void {
  addressHandler = handler;
  return () => {
    if (addressHandler === handler) addressHandler = null;
  };
}

/** Hands Cmd+L to the app; false when nothing took it. */
export function requestAddress(): boolean {
  return addressHandler?.() ?? false;
}

let copyUrlHandler: (() => boolean) | null = null;

/** Lets the app copy the page's link (Cmd+Option+C, Cmd+Shift+C) and say so. */
export function setCopyUrlHandler(handler: (() => boolean) | null): () => void {
  copyUrlHandler = handler;
  return () => {
    if (copyUrlHandler === handler) copyUrlHandler = null;
  };
}

/** Hands copying the link to the app; false when nothing took it. */
export function requestCopyUrl(): boolean {
  return copyUrlHandler?.() ?? false;
}

let closeHandler: (() => void) | null = null;

/** Lets the app decide what Cmd+W closes while a page has focus. */
export function setCloseHandler(handler: (() => void) | null): () => void {
  closeHandler = handler;
  return () => {
    if (closeHandler === handler) closeHandler = null;
  };
}

/** Hands Cmd+W to the app; false when nothing took it, so the browser closes the tab itself. */
export function requestClose(): boolean {
  if (!closeHandler) return false;
  closeHandler();
  return true;
}
