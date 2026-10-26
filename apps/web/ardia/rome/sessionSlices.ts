// Rome's browser can span several app windows, and each window's page runs its
// own copy of the browser holding only its own window. The main window keeps its
// window, tabs and groups in session.json, as before. Each other window keeps its
// own in `rome:window:<id>`. What every window shares (spaces, settings, closed
// tabs) stays in session.json, and a window writes it only when it changed it, so
// one window never overwrites another's newer spaces or settings.

/** The browser window this page shows; null in the main window. */
export const ROME_WINDOW =
  typeof location === "undefined" ? null : new URLSearchParams(location.search).get("romeWindow");

export const SESSION_DOCUMENT = "session.json";
export const SESSION_KEY = `ardia:document:${SESSION_DOCUMENT}`;
export const SLICE_PREFIX = "rome:window:";

/** What all windows share. Everything else in session.json belongs to one window. */
export const SHARED_FIELDS = [
  "profiles",
  "profileOrder",
  "orphanedProfileData",
  "settings",
  "closedTabs",
  "closedWindows",
  "parkedPins",
  "pinChoices",
  "pinSync",
  "closedGroups",
  "deletedGroups",
  "cleanedTabs",
] as const;

const WINDOW_FIELDS = [
  "windows",
  "windowOrder",
  "focusedWindowId",
  "lastProfileId",
  "tabs",
  "groups",
  "splits",
  "launchTab",
  "launchBackdrop",
  "linkProfile",
] as const;

type Doc = Record<string, unknown>;

const pick = (doc: Doc | null, fields: readonly string[]): Doc =>
  Object.fromEntries(fields.filter((field) => doc && field in doc).map((f) => [f, doc![f]]));

const parse = (raw: string | null): Doc | null => {
  try {
    return raw ? (JSON.parse(raw) as Doc) : null;
  } catch {
    return null;
  }
};

/** The windows' saved slices, by window id, besides the main window's. */
export function readSlices(): Map<string, Doc> {
  const slices = new Map<string, Doc>();
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(SLICE_PREFIX)) continue;
    const slice = parse(localStorage.getItem(key));
    if (slice) slices.set(key.slice(SLICE_PREFIX.length), slice);
  }
  return slices;
}

export const writeSlice = (windowId: string, slice: Doc) =>
  localStorage.setItem(SLICE_PREFIX + windowId, JSON.stringify(slice));

export const removeSlice = (windowId: string) => localStorage.removeItem(SLICE_PREFIX + windowId);

export const readSlice = (windowId: string) => parse(localStorage.getItem(SLICE_PREFIX + windowId));

// The shared part as this window last wrote or took it in. A save whose shared
// part still matches hasn't changed it, so keeps what's stored, which may be newer.
let lastShared: string | null = null;

/** session.json as this window sees it: the main window's as stored; another window's own slice with the shared part. */
export function readSession(): string | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (ROME_WINDOW === null) return raw;
  const stored = parse(raw);
  const slice = readSlice(ROME_WINDOW);
  return JSON.stringify({
    version: 2,
    ...pick(stored, SHARED_FIELDS),
    windows: [],
    windowOrder: [],
    tabs: [],
    groups: [],
    splits: [],
    ...slice,
    focusedWindowId: ROME_WINDOW,
  });
}

/** Saves session.json as this window wrote it: its own windows, and the shared part only if it changed it. */
export function writeSession(contents: string) {
  const mine = parse(contents);
  if (!mine) return;
  const stored = parse(localStorage.getItem(SESSION_KEY));
  const shared = JSON.stringify(pick(mine, SHARED_FIELDS));
  const changedShared = lastShared !== null && shared !== lastShared;
  lastShared = shared;
  const sharedPart =
    changedShared || !stored ? pick(mine, SHARED_FIELDS) : pick(stored, SHARED_FIELDS);
  if (ROME_WINDOW === null) {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...mine, ...sharedPart, ...pick(mine, WINDOW_FIELDS) }),
    );
    return;
  }
  writeSlice(ROME_WINDOW, pick(mine, WINDOW_FIELDS));
  if (changedShared && stored) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...stored, ...sharedPart }));
  }
}

/**
 * Another window saved session.json: its shared part, when that differs from what
 * this window has, else null. The next save takes it as this window's own.
 */
export function sharedFromOtherWindow(raw: string | null): Doc | null {
  const shared = pick(parse(raw), SHARED_FIELDS);
  const json = JSON.stringify(shared);
  if (json === "{}" || json === lastShared) return null;
  lastShared = null;
  return shared;
}
