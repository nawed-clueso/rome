import { flushPersistence } from "@ardia-app/lib/persist";
import { useBrowser, type BrowserState } from "@ardia-app/store/browser";
import { isIncognitoProfile, newId } from "@ardia-app/store/model";
import type { BrowserWindow, Tab } from "@ardia-app/store/types";
import { desktop } from "../bridge";
import {
  readSlice,
  readSlices,
  removeSlice,
  ROME_WINDOW,
  SESSION_KEY,
  SLICE_PREFIX,
  sharedFromOtherWindow,
  writeSlice,
} from "./sessionSlices";

// Rome's browser windows. The main window holds every space no other window has
// taken; "Open in new window" hands a space's tabs to a new window, and closing
// that window hands them back. Each page runs its own copy of the browser holding
// only its own window (sessionSlices.ts), so the copies never fight over a tab.

/** This page's window, as the other windows name it. */
export const THIS_WINDOW = ROME_WINDOW ?? "main";

type Slice = {
  windows?: { id: string; profileId: string }[];
  tabs?: { id: string; profileId: string }[];
};

const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

/** Hears other windows opening, closing, or taking or giving back spaces. */
export function onWindowsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Tabs that went to another window, so leaving this one doesn't close them anywhere. */
const handedOff = new Set<string>();
export const wasHandedOff = (tabId: string) => handedOff.has(tabId);

const myWindow = (s: BrowserState) => {
  const id = s.ui.focusedWindowId ?? s.windowOrder[0];
  return id && s.windows[id] ? id : null;
};

/** Which other window each space lives in; spaces missing live here or in the main window. */
export function otherWindowSpaces(): Record<string, string> {
  const homes: Record<string, string> = {};
  for (const [windowId, value] of readSlices()) {
    const slice = value as Slice;
    const spaces = new Set([
      ...(slice.windows ?? []).map((w) => w.profileId),
      ...(slice.tabs ?? []).map((t) => t.profileId),
    ]);
    for (const space of spaces) homes[space] = windowId;
  }
  if (ROME_WINDOW === null) return homes;
  // Seen from another window: its own spaces are home, the rest live in the main window.
  const s = useBrowser.getState();
  const mine = new Set(Object.values(s.tabs).map((t) => t.profileId));
  const id = myWindow(s);
  if (id) mine.add(s.windows[id]!.profileId);
  const elsewhere: Record<string, string> = {};
  for (const space of s.profileOrder) {
    if (mine.has(space)) continue;
    elsewhere[space] = homes[space] && homes[space] !== ROME_WINDOW ? homes[space] : "main";
  }
  return elsewhere;
}

const channel =
  typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("rome:windows");
type WindowMessage = { type: "show-space"; windowId: string; spaceId: string };

/**
 * When `spaceId` lives in another window, brings that window forward on it and
 * returns true; false when it lives here.
 */
export function showSpaceElsewhere(spaceId: string): boolean {
  const windowId = otherWindowSpaces()[spaceId];
  if (!windowId) return false;
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- A BroadcastChannel has no target origin.
  channel?.postMessage({ type: "show-space", windowId, spaceId } satisfies WindowMessage);
  void desktop?.windows?.("focus", windowId);
  return true;
}

/** Spaces this window could hand to a new window: any of its own, while another stays behind. */
export function spacesForNewWindow(): string[] {
  const s = useBrowser.getState();
  const elsewhere = otherWindowSpaces();
  const here = s.profileOrder.filter((id) => !elsewhere[id] && !isIncognitoProfile(id));
  return here.length > 1 ? here : [];
}

// A tab as it is saved: without the live page it has in this window.
const savedTab = ({ navigation: _n, adoptId: _a, wakeAdoptId: _w, pageIn, ...tab }: Tab) =>
  pageIn ? { ...tab, unloaded: true as const } : tab;

/**
 * Moves `spaceId` and its tabs into a new app window. Done by hand rather than
 * with the browser's own window moves, which leave copies of pinned tabs behind:
 * here a space lives in one window only.
 */
export function openSpaceInNewWindow(spaceId: string): boolean {
  if (!desktop?.windows || !spacesForNewWindow().includes(spaceId)) return false;
  let s = useBrowser.getState();
  const from = myWindow(s);
  if (!from) return false;
  // This window moves to another of its spaces first.
  if (s.windows[from]!.profileId === spaceId) {
    const next = spacesForNewWindow().find((id) => id !== spaceId);
    if (!next) return false;
    s.switchProfile(from, next);
    s = useBrowser.getState();
  }
  const source = s.windows[from]!;
  const tabIds = source.tabIds.filter((id) => s.tabs[id]?.profileId === spaceId);
  const ids = new Set(tabIds);
  const windowId = newId("w");
  const active = source.activeTabIds[spaceId];
  const created: BrowserWindow = {
    id: windowId,
    profileId: spaceId,
    incognito: false,
    tabIds,
    activeTabIds: active && ids.has(active) ? { [spaceId]: active } : {},
    sidebarOpen: source.sidebarOpen,
    ...(source.tabLayout ? { tabLayout: source.tabLayout } : {}),
    frame: null,
    createdAt: Date.now(),
  };
  const moves = <T extends { windowId: string; tabIds: string[] }>(item: T) =>
    item.windowId === from && item.tabIds.length > 0 && item.tabIds.every((id) => ids.has(id));
  const groups = Object.values(s.groups).filter(moves);
  const splits = Object.values(s.splits).filter(moves);
  writeSlice(windowId, {
    windows: [created],
    windowOrder: [windowId],
    focusedWindowId: windowId,
    lastProfileId: spaceId,
    tabs: tabIds.map((id) => ({ ...savedTab(s.tabs[id]!), windowId })),
    groups: groups.map((g) => ({ ...g, windowId })),
    splits: splits.map((v) => ({ ...v, windowId })),
  });
  for (const id of ids) handedOff.add(id);
  const movedGroups = new Set(groups.map((g) => g.id));
  const movedSplits = new Set(splits.map((v) => v.id));
  const { [spaceId]: _, ...stillActive } = source.activeTabIds;
  useBrowser.setState((state) => ({
    windows: {
      ...state.windows,
      [from]: {
        ...state.windows[from]!,
        tabIds: state.windows[from]!.tabIds.filter((id) => !ids.has(id)),
        activeTabIds: stillActive,
      },
    },
    tabs: Object.fromEntries(Object.entries(state.tabs).filter(([id]) => !ids.has(id))),
    groups: Object.fromEntries(Object.entries(state.groups).filter(([id]) => !movedGroups.has(id))),
    splits: Object.fromEntries(Object.entries(state.splits).filter(([id]) => !movedSplits.has(id))),
  }));
  flushPersistence();
  void desktop.windows("open", windowId);
  notify();
  return true;
}

/** In the main window: a window closed, so its spaces and tabs come back here. */
function takeBack(windowId: string) {
  const slice = readSlice(windowId) as {
    windows?: BrowserState["windows"][string][];
    tabs?: Tab[];
    groups?: BrowserState["groups"][string][];
    splits?: BrowserState["splits"][string][];
  } | null;
  removeSlice(windowId);
  const s = useBrowser.getState();
  const into = myWindow(s);
  if (!slice || !into) return notify();
  const tabs = (slice.tabs ?? []).filter((t) => !s.tabs[t.id]);
  const closed = slice.windows?.[0];
  useBrowser.setState((state) => {
    const target = state.windows[into]!;
    return {
      tabs: {
        ...state.tabs,
        ...Object.fromEntries(tabs.map((t) => [t.id, { ...t, windowId: into }])),
      },
      windows: {
        ...state.windows,
        [into]: {
          ...target,
          tabIds: [...target.tabIds, ...tabs.map((t) => t.id)],
          activeTabIds: { ...closed?.activeTabIds, ...target.activeTabIds },
        },
      },
      groups: {
        ...state.groups,
        ...Object.fromEntries((slice.groups ?? []).map((g) => [g.id, { ...g, windowId: into }])),
      },
      splits: {
        ...state.splits,
        ...Object.fromEntries((slice.splits ?? []).map((v) => [v.id, { ...v, windowId: into }])),
      },
    };
  });
  flushPersistence();
  notify();
}

/** Starts this page's part: keeping its window, hearing the others, and reopening them at launch. */
export function startWindows() {
  const s = useBrowser.getState();
  if (ROME_WINDOW !== null) {
    // Another window's page that lost its slice has nothing to show.
    if (!s.windows[ROME_WINDOW]) {
      window.close();
      return;
    }
    // Only this window's copy of the browser lives here, so it stays the focused one.
    useBrowser.subscribe((state) => {
      if (state.ui.focusedWindowId !== ROME_WINDOW && state.windows[ROME_WINDOW]) {
        useBrowser.setState({ ui: { ...state.ui, focusedWindowId: ROME_WINDOW } });
      }
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key === SESSION_KEY) {
      const shared = sharedFromOtherWindow(event.newValue);
      if (shared) useBrowser.setState(shared as Partial<BrowserState>);
      return;
    }
    if (event.key?.startsWith(SLICE_PREFIX)) notify();
  });
  // A window's page closes with its last changes saved.
  window.addEventListener("pagehide", () => flushPersistence());

  channel?.addEventListener("message", (event: MessageEvent<WindowMessage>) => {
    const message = event.data;
    if (message?.type !== "show-space" || message.windowId !== THIS_WINDOW) return;
    const state = useBrowser.getState();
    const id = myWindow(state);
    if (id && state.profiles[message.spaceId]) state.switchProfile(id, message.spaceId);
  });

  if (ROME_WINDOW !== null || !desktop?.windows) return;
  desktop.onWindowClosed?.((id) => takeBack(id));
  // Windows open when Rome last quit open again; a reload leaves open ones be.
  void Promise.resolve(desktop.windows("list")).then((open) => {
    const already = new Set(Array.isArray(open) ? (open as string[]) : []);
    for (const id of readSlices().keys()) {
      if (!already.has(id)) void desktop?.windows?.("open", id);
    }
  });
}
