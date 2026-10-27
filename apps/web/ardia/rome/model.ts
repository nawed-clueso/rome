import { closeTab as closeTabAsked, switchToTab } from "@ardia-app/lib/actions";
import { PROFILE_COLORS, profileAccent, profileTheme } from "@ardia-app/lib/theme";
import { useBrowser, type BrowserState } from "@ardia-app/store/browser";
import { activeTabId, pinSection, tabLabel, viewTabIds } from "@ardia-app/store/model";
import type { Tab } from "@ardia-app/store/types";
import { webviews } from "@ardia-app/lib/webviews";
import { wantsPage } from "@ardia-app/lib/tabPages";
import { lastPicture, startTabPictures } from "@ardia-app/lib/tabPictures";
import { wake } from "@ardia-app/store/model";
import { desktop } from "../bridge";
import {
  onWindowsChanged,
  otherWindowSpaces,
  showSpaceElsewhere,
  spacesForNewWindow,
  wasHandedOff,
} from "./windows";
import {
  knownFavicon,
  pageEngine,
  setAgentDriven,
  setParked,
  showPageAt,
} from "../shims/web/webviewPool";

// The browser as T3 Code's own UI sees it: spaces, tabs and which thread each tab
// belongs to. T3 Code draws all of it; Ardia only keeps the tabs and pages.

export type RomeSpace = {
  id: string;
  name: string;
  /** An emoji or short text the user chose; null shows the name's first letter. */
  icon: string | null;
  color: string;
  /** The space's colour, for its mark and accents. */
  accent: string;
  /** Window tint as a gradient, from the top left. */
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
  /** The colour the page asks browsers to frame it in (its theme-color), if any. */
  themeColor: string | null;
  /** The thread this tab was opened for, as T3 Code's scoped thread key. */
  owner: string | null;
  /** The tab whose link opened this one (a Cmd-click or a new-window link), if any. */
  openerId: string | null;
};

export type SavedTab = { url: string; title: string; favicon: string | null; spaceId: string };

export type RomeBrowser = {
  windowId: string | null;
  spaceId: string | null;
  spaces: RomeSpace[];
  tabs: Record<string, RomeTab>;
  /** Each space's tabs in sidebar order, pinned first. */
  order: Record<string, string[]>;
  /** The tab each space shows. */
  active: Record<string, string>;
  /** Tabs put away with their settled thread, by thread key. */
  saved: Record<string, SavedTab[]>;
  /** Spaces open in another app window, by that window ("main" for the main one). */
  elsewhere: Record<string, string>;
  /** Spaces this window could move to a new window; empty while it has only one. */
  newWindowSpaces: string[];
};

const OWNERS_KEY = "rome:tab-owners:v1";
const SAVED_KEY = "rome:thread-tabs:v1";

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

let owners: Record<string, string> = read(OWNERS_KEY, {});
let saved: Record<string, SavedTab[]> = read(SAVED_KEY, {});
let browsingFor: string | null = null;
let revision = 0;

// Every app window keeps these maps, each for its own tabs and threads, so a save
// lays this window's entries over what's stored and drops only what it removed.
const dropped = { owners: new Set<string>(), saved: new Set<string>() };
const dropOwner = (tabId: string) => {
  delete owners[tabId];
  dropped.owners.add(tabId);
};
const dropSaved = (threadKey: string) => {
  const { [threadKey]: _, ...rest } = saved;
  saved = rest;
  dropped.saved.add(threadKey);
};
const merged = <T>(key: string, mine: Record<string, T>, gone: Set<string>) => {
  const next = { ...read<Record<string, T>>(key, {}), ...mine };
  for (const id of gone) delete next[id];
  gone.clear();
  return next;
};

const persist = () => {
  revision += 1;
  owners = merged(OWNERS_KEY, owners, dropped.owners);
  saved = merged(SAVED_KEY, saved, dropped.saved);
  localStorage.setItem(OWNERS_KEY, JSON.stringify(owners));
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  notify();
};

const store = () => useBrowser.getState();

const focusedWindow = (s: BrowserState) => {
  const id = s.ui.focusedWindowId ?? s.windowOrder[0];
  return id && s.windows[id] ? id : null;
};

const siteIcon = (url: string) => {
  try {
    const { protocol, origin } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? `${origin}/favicon.ico` : null;
  } catch {
    return null;
  }
};

/** What a tab is called: a name the user gave it, else the page's title, else its site. */
export const pageTitle = (tab: Tab): string =>
  tab.customTitle ||
  (tab.url && tab.title?.trim() && tab.title.trim() !== tab.url ? tab.title.trim() : tabLabel(tab));

const faviconOf = (tab: Tab) =>
  tab.customIcon ?? tab.favicon ?? knownFavicon(tab.url) ?? siteIcon(tab.url);

function snapshot(s: BrowserState): RomeBrowser {
  const windowId = focusedWindow(s);
  const window = windowId ? s.windows[windowId] : undefined;
  const spaces = s.profileOrder.flatMap((id) => {
    const profile = s.profiles[id];
    if (!profile) return [];
    const light = profileTheme(profile, false).windowTint;
    const dark = profileTheme(profile, true).windowTint;
    // Ardia's own icons are SF Symbol names, which only the native app can draw.
    const icon =
      profile.icon && !/^[a-z0-9]+(\.[a-z0-9]+)+$/.test(profile.icon) ? profile.icon : null;
    return [
      {
        id,
        name: profile.name,
        icon,
        color: profile.color,
        accent: profileAccent(profile),
        tint: { light, dark },
      },
    ];
  });
  const tabs: Record<string, RomeTab> = {};
  const order: Record<string, string[]> = {};
  const active: Record<string, string> = {};
  if (windowId) {
    for (const space of spaces) {
      order[space.id] = viewTabIds(s, windowId, space.id);
      const shown = activeTabId(s, windowId, space.id);
      if (shown) active[space.id] = shown;
    }
  }
  for (const tab of Object.values(s.tabs)) {
    if (tab.windowId !== windowId) continue;
    const live = s.live[tab.id];
    tabs[tab.id] = {
      id: tab.id,
      spaceId: tab.profileId,
      title: pageTitle(tab),
      url: tab.url,
      favicon: faviconOf(tab),
      pinned: tab.pinned,
      lastActiveAt: tab.lastActiveAt,
      loading: !!live?.isLoading,
      audible: !!live?.playingAudio,
      canGoBack: !!live?.canGoBack,
      canGoForward: !!live?.canGoForward,
      themeColor: live?.themeColor ?? null,
      owner: tab.pinned ? null : (owners[tab.id] ?? null),
      openerId: tab.openerId ?? null,
    };
  }
  return {
    windowId,
    spaceId: window?.profileId ?? null,
    spaces,
    tabs,
    order,
    active,
    saved,
    elsewhere: otherWindowSpaces(),
    newWindowSpaces: spacesForNewWindow(),
  };
}

// Rebuilt only when something it reads changed.
let cached: { inputs: unknown[]; value: RomeBrowser } | null = null;
function current(): RomeBrowser {
  const s = store();
  const inputs = [
    s.tabs,
    s.windows,
    s.profiles,
    s.profileOrder,
    s.live,
    s.ui.focusedWindowId,
    s.ui.appDark,
    revision,
  ];
  if (cached && cached.inputs.every((input, i) => input === inputs[i])) return cached.value;
  cached = { inputs, value: snapshot(s) };
  return cached.value;
}

const listeners = new Set<(browser: RomeBrowser) => void>();
let last: RomeBrowser | null = null;
function notify() {
  const next = current();
  if (next === last) return;
  last = next;
  for (const listener of listeners) listener(next);
}

let started = false;
function start() {
  if (started) return;
  started = true;
  let known = new Set(Object.keys(store().tabs));
  onWindowsChanged(() => {
    revision += 1;
    notify();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== OWNERS_KEY && event.key !== SAVED_KEY) return;
    owners = read(OWNERS_KEY, {});
    saved = read(SAVED_KEY, {});
    revision += 1;
    notify();
  });
  useBrowser.subscribe((s, prev) => {
    if (s.tabs !== prev.tabs) {
      let changed = false;
      for (const id of Object.keys(s.tabs)) {
        if (known.has(id)) continue;
        const tab = s.tabs[id]!;
        // A page opened from a thread's tab stays with that thread.
        const owner = (tab.openerId && owners[tab.openerId]) || browsingFor;
        if (owner && !tab.pinned) {
          owners[id] = owner;
          changed = true;
        }
      }
      // Only this window's closed tabs: the others' tabs were never here, and tabs
      // handed to another window are still open there.
      for (const id of Object.keys(owners)) {
        const gone = known.has(id) && !s.tabs[id] && !wasHandedOff(id);
        if (gone || s.tabs[id]?.pinned) {
          dropOwner(id);
          changed = true;
        }
      }
      known = new Set(Object.keys(s.tabs));
      if (changed) persist();
    }
    notify();
  });
}

/** Calls `listener` with the browser now and whenever it changes. */
export function watchBrowser(listener: (browser: RomeBrowser) => void): () => void {
  start();
  listeners.add(listener);
  listener(current());
  return () => void listeners.delete(listener);
}

/** New tabs opened from here on belong to this thread; null for tabs of their own. */
export function setBrowsingFor(threadKey: string | null) {
  browsingFor = threadKey;
}

export function activateTab(tabId: string) {
  if (store().tabs[tabId]) switchToTab(tabId);
}

export function closeTab(tabId: string) {
  if (store().tabs[tabId]) void closeTabAsked(tabId);
}

export function setPinned(tabId: string, pinned: boolean) {
  const s = store();
  const tab = s.tabs[tabId];
  if (!tab || tab.pinned === pinned) return;
  s.pinTabs([tabId], pinned);
}

/** Moves a tab to just before `beforeId` among its space's tabs pinned the same way; null for last. */
export function moveTab(tabId: string, beforeId: string | null) {
  const s = store();
  const tab = s.tabs[tabId];
  if (!tab) return;
  const section = viewTabIds(s, tab.windowId, tab.profileId).filter(
    (id) => id !== tabId && pinSection(s.tabs[id]) === pinSection(tab),
  );
  const index = beforeId ? section.indexOf(beforeId) : -1;
  s.moveTab(tabId, index < 0 ? section.length : index);
}

export function switchSpace(spaceId: string) {
  // A space open in another window brings that window forward instead.
  if (showSpaceElsewhere(spaceId)) return;
  const s = store();
  const windowId = focusedWindow(s);
  if (windowId && s.profiles[spaceId]) s.switchProfile(windowId, spaceId);
}

/** Opens `url` in a new foreground tab, for `owner`'s thread or on its own. */
export function openTab(
  url: string,
  options: { owner?: string | null; spaceId?: string; background?: boolean } = {},
): string | null {
  const s = store();
  const windowId = focusedWindow(s) ?? s.createWindow();
  const previous = browsingFor;
  browsingFor = options.owner ?? null;
  try {
    return s.newTab(windowId, { url, background: options.background, profileId: options.spaceId });
  } finally {
    browsingFor = previous;
  }
}

/** Closes a settled thread's tabs, keeping them with the thread. */
export function putAwayThreadTabs(threadKey: string) {
  const s = store();
  const ids = Object.keys(owners).filter((id) => owners[id] === threadKey && s.tabs[id]?.url);
  if (!ids.length) return;
  const kept = ids.map((id) => {
    const tab = s.tabs[id]!;
    return { url: tab.url, title: pageTitle(tab), favicon: faviconOf(tab), spaceId: tab.profileId };
  });
  saved = { ...saved, [threadKey]: [...(saved[threadKey] ?? []), ...kept] };
  for (const id of ids) dropOwner(id);
  s.closeTabs(ids);
  persist();
}

/** Reopens what a thread put away, in the background unless `focusUrl` names one to show. */
export function bringBackThreadTabs(threadKey: string, focusUrl?: string): string | null {
  const tabs = saved[threadKey];
  if (!tabs?.length) return null;
  dropSaved(threadKey);
  let focused: string | null = null;
  for (const tab of tabs) {
    const id = openTab(tab.url, {
      owner: threadKey,
      spaceId: tab.spaceId,
      background: tab.url !== focusUrl,
    });
    if (id && tab.url === focusUrl) focused = id;
  }
  persist();
  return focused;
}

/** For a thread that is gone: its open tabs become tabs of their own, its put-away ones are dropped. */
export function forgetThreadTabs(threadKey: string) {
  const owned = Object.keys(owners).filter((id) => owners[id] === threadKey);
  if (!owned.length && !saved[threadKey]) return;
  for (const id of owned) dropOwner(id);
  dropSaved(threadKey);
  persist();
}

export type PageAction = "back" | "forward" | "reload" | "stop";

/** The page controls T3 Code draws above a tab. */
export function pageAction(tabId: string, action: PageAction) {
  const page = webviews.get(tabId);
  if (!page) return;
  if (action === "back") void page.goBack();
  else if (action === "forward") void page.goForward();
  else if (action === "reload") void page.reload();
  else void page.stopLoading();
}

/** Loads `url` in the tab, as typing it in the address field does. */
export function navigateTab(tabId: string, url: string) {
  if (store().tabs[tabId]) store().navigate(tabId, url);
}

/** The colours a space can take, as Ardia names them, with their swatch. */
export const SPACE_COLORS = Object.entries(PROFILE_COLORS).map(([id, spec]) => ({
  id,
  name: spec.name,
  swatch: spec.swatch,
}));

export function updateSpace(
  spaceId: string,
  patch: { name?: string; icon?: string | null; color?: string },
) {
  const s = store();
  if (!s.profiles[spaceId]) return;
  s.updateProfile(spaceId, patch as Parameters<typeof s.updateProfile>[1]);
}

/** Makes a space and switches to it. */
export function createSpace(options: {
  name: string;
  icon?: string | null;
  color?: string;
}): string {
  const s = store();
  const id = s.createProfile(options as Parameters<typeof s.createProfile>[0]);
  switchSpace(id);
  return id;
}

/**
 * Shows a tab's page over `element`, outside the browser window (a split pane);
 * null gives it back. A sleeping tab wakes first.
 */
export function showTabAt(tabId: string, element: HTMLElement | null) {
  const tab = store().tabs[tabId];
  if (element && tab && !wantsPage(tab)) store().updateTab(tabId, wake(tab));
  showPageAt(tabId, element);
}

/** Tells the pages the browser window is hidden, so its own page stays unseen. */
export function setBrowserParked(parked: boolean) {
  setParked(parked);
}

/** Loads a sleeping tab's page without showing it. */
export function wakeTab(tabId: string) {
  const tab = store().tabs[tabId];
  if (tab && !wantsPage(tab)) store().updateTab(tabId, wake(tab));
}

/** Keeps a tab's page drawn while out of view, for an agent working in it. */
export function setTabAgentDriven(tabId: string, driven: boolean) {
  setAgentDriven(tabId, driven);
}

/** A tab's session partition and guest id, for its extension buttons; null until its page loads. */
export function tabEngine(tabId: string) {
  return pageEngine(tabId);
}

/** A small picture of the tab's page as last seen, or null if it hasn't been shown since launch. */
export function tabPicture(tabId: string): string | null {
  const picture = lastPicture(tabId);
  return picture ? `data:image/png;base64,${picture.data}` : null;
}

/** Starts keeping pictures of pages as they are viewed. */
export function startPictures() {
  startTabPictures();
}

/** Lets the user pick elements on a tab's page; resolves with the annotation, or null. */
export async function pickInTab(tabId: string, theme: unknown): Promise<unknown> {
  const engine = pageEngine(tabId);
  if (!engine || !desktop?.pickElement) return null;
  return desktop.pickElement(engine.webContentsId, theme);
}

export function cancelPickInTab(tabId: string) {
  const engine = pageEngine(tabId);
  if (engine) desktop?.cancelPick?.(engine.webContentsId);
}

/** The tab's visible page as a PNG data URL. */
export async function snapshotTab(tabId: string): Promise<string | null> {
  const engine = pageEngine(tabId);
  if (!engine || !desktop?.snapshot) return null;
  return desktop.snapshot(engine.webContentsId);
}

/** Shows or hides the macOS window buttons (a full-window page hides them, as Arc does). */
export function setWindowControlsVisible(visible: boolean) {
  desktop?.setWindowControlsVisible?.(visible);
}
