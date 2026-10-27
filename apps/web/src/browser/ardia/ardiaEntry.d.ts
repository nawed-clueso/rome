// Built by vite/ardia.ts from apps/web/ardia/entry.tsx. Declared here so the app's
// typecheck stops at this boundary instead of walking Ardia's React Native sources.
declare module "@t3-ardia/entry" {
  import type { ComponentType } from "react";

  export const ArdiaBrowser: ComponentType;
  export function openUrl(url: string): void;
  export type ArdiaActivePage = { title: string; url: string; favicon: string | null };
  export type NewTabTarget =
    | { kind: "list" }
    | { kind: "group"; groupId: string }
    | { kind: "into"; tabId: string };
  /** New tabs start on T3 Code's New screen instead of the browser's own new-tab bar. */
  export function setNewTabHandler(
    handler: ((windowId: string, target: NewTabTarget) => void) | null,
  ): () => void;
  /** Cmd+N on a page starts a chat instead of opening a browser window. */
  export function setNewChatHandler(handler: (() => void) | null): () => void;
  /** The browser's "toggle sidebar" (Cmd+S while a page has focus). */
  export function onSidebarToggle(listener: () => void): () => void;
  /** Hears every tab the user opens from the sidebar. */
  export function onTabOpened(listener: (tabId: string) => void): () => void;
  export function setCloseHandler(handler: (() => void) | null): () => void;
  /** Cmd+L while a page has focus; the handler returns false to leave it to the browser. */
  export function setAddressHandler(handler: (() => boolean) | null): () => void;
  /** Copying the page's link (Cmd+Option+C, Cmd+Shift+C) while a page has focus. */
  export function setCopyUrlHandler(handler: (() => boolean) | null): () => void;
  export type RomeSpace = {
    id: string;
    name: string;
    icon: string | null;
    color: string;
    accent: string;
    tint: { light: [string, string]; dark: [string, string] };
  };
  export type RomeTab = {
    id: string;
    spaceId: string;
    title: string;
    url: string;
    favicon: string | null;
    pinned: boolean;
    lastActiveAt: number;
    loading: boolean;
    audible: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    themeColor: string | null;
    owner: string | null;
    openerId: string | null;
  };
  export type SavedTab = { url: string; title: string; favicon: string | null; spaceId: string };
  export type RomeBrowser = {
    windowId: string | null;
    spaceId: string | null;
    spaces: RomeSpace[];
    tabs: Record<string, RomeTab>;
    order: Record<string, string[]>;
    active: Record<string, string>;
    saved: Record<string, SavedTab[]>;
    /** Spaces open in another app window, by that window ("main" for the main one). */
    elsewhere: Record<string, string>;
    /** Spaces this window could move to a new window; empty while it has only one. */
    newWindowSpaces: string[];
  };
  /** Moves a space and its tabs into a new app window; false when it can't. */
  export function openSpaceInNewWindow(spaceId: string): boolean;
  /** Whether a tab left this window for another app window, rather than closing. */
  export function wasHandedOff(tabId: string): boolean;
  export function watchBrowser(listener: (browser: RomeBrowser) => void): () => void;
  export function setBrowsingFor(threadKey: string | null): void;
  export function activateTab(tabId: string): void;
  export function closeTab(tabId: string): void;
  export function setPinned(tabId: string, pinned: boolean): void;
  /** Keeps a tab's page drawn while out of view, for an agent working in it. */
  export function setTabAgentDriven(tabId: string, driven: boolean): void;
  /** Loads a sleeping tab's page without showing it. */
  export function wakeTab(tabId: string): void;
  export type ClosedRomeTab = {
    id: string;
    title: string;
    url: string;
    favicon: string | null;
    closedAt: number;
  };
  /** A space's most recently closed tabs, newest first. */
  export function recentlyClosed(spaceId: string, limit: number): ClosedRomeTab[];
  /** Reopens a closed tab where it was. */
  export function restoreClosedTab(entryId: string): void;
  export type TopSite = { url: string; title: string; favicon: string | null; visits: number };
  /** A space's most visited sites, one per site. */
  export function topSites(spaceId: string, limit: number): TopSite[];
  /** Moves a tab before `beforeId` among its space's tabs pinned the same way; null for last. */
  export function moveTab(tabId: string, beforeId: string | null): void;
  export function showTabAt(tabId: string, element: HTMLElement | null): void;
  export function setBrowserParked(parked: boolean): void;
  export function tabEngine(tabId: string): { partition: string; webContentsId: number } | null;
  export function tabPicture(tabId: string): string | null;
  export function pickInTab(tabId: string, theme: unknown): Promise<unknown>;
  export function cancelPickInTab(tabId: string): void;
  export function snapshotTab(tabId: string): Promise<string | null>;
  export function setWindowControlsVisible(visible: boolean): void;
  export function startPictures(): void;
  export function switchSpace(spaceId: string): void;
  export const SPACE_COLORS: ReadonlyArray<{ id: string; name: string; swatch: string }>;
  export function updateSpace(
    spaceId: string,
    patch: { name?: string; icon?: string | null; color?: string },
  ): void;
  export function createSpace(options: {
    name: string;
    icon?: string | null;
    color?: string;
  }): string;
  export function openTab(
    url: string,
    options?: { owner?: string | null; spaceId?: string; background?: boolean },
  ): string | null;
  export function putAwayThreadTabs(threadKey: string): void;
  export function pageAction(tabId: string, action: "back" | "forward" | "reload" | "stop"): void;
  export function navigateTab(tabId: string, url: string): void;
  export function bringBackThreadTabs(threadKey: string, focusUrl?: string): string | null;
  export function forgetThreadTabs(threadKey: string): void;
  export type Suggestion =
    | {
        kind: "page";
        url: string;
        title: string;
        favicon: string | null;
        tabId?: string;
        bookmarked?: boolean;
        visited?: boolean;
      }
    | {
        kind: "search";
        query: string;
        url: string;
        engine: string;
        suggested?: boolean;
        bang?: true;
      }
    | { kind: "calc"; expression: string; value: string; url: string }
    | { kind: "action"; id: string; title: string; icon?: string; hint?: string }
    | { kind: "create"; id: string; title: string; url: string; site: string };
  /** Suggestions for `text`; `onResult` hears local ones at once and again with the engine's. */
  export function suggest(
    text: string,
    onResult: (items: Suggestion[], completion: string) => void,
  ): () => void;
  export function addressFor(text: string): string;
  export type PageSwipeAction = "back" | "forward";
  /** A two-finger swipe on a page, as it happens. */
  export type PageSwipe = {
    readonly tabId: string;
    readonly phase: "began" | "changed" | "ended" | "cancelled";
    readonly side: "left" | "right";
    readonly progress: number;
    readonly action: PageSwipeAction | null;
    readonly rect: { left: number; top: number; width: number; height: number };
  };
  /** Hears page swipes, to draw them; returns a function that stops. */
  export function onPageSwipe(listener: (swipe: PageSwipe) => void): () => void;
  /** Adds pages visited in another browser to a space's history; returns how many were new. */
  export function importVisits(
    visits: readonly { url: string; title: string; visits: number; lastVisit: number }[],
    spaceId: string,
  ): number;
  export function searchEngineName(): string;
  export function watchActivePage(listener: (page: ArdiaActivePage | null) => void): () => void;
}
