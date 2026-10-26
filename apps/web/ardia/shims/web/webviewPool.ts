import type {
  CrashInfo,
  NavigationState,
  OpenDisposition,
  WebViewHandle,
  WebViewProps,
} from "@ardia-real/ardiacore";
import { useBrowser } from "@ardia-app/store/browser";
import { desktop, type DesktopOpenWindow } from "../../bridge";

// Electron reloads a <webview> whenever it leaves the DOM, so a tab's guest lives
// here for the tab's whole life, in a layer over the Ardia window, and follows
// whichever placeholder currently shows it. Native Ardia gets the same effect from
// `transferKey`, which hands a live Chrome tab between React Native views.

type NativeImageLike = {
  toDataURL(): string;
  getSize(): { width: number; height: number };
  resize(options: { width: number }): NativeImageLike;
};

type WebviewTag = HTMLElement & {
  src: string;
  loadURL(url: string): Promise<void>;
  getURL(): string;
  getTitle(): string;
  isLoading(): boolean;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  goToOffset(offset: number): void;
  reload(): void;
  reloadIgnoringCache(): void;
  stop(): void;
  setAudioMuted(muted: boolean): void;
  isAudioMuted(): boolean;
  getZoomFactor(): number;
  setZoomFactor(factor: number): void;
  findInPage(text: string, options?: { forward?: boolean; findNext?: boolean }): number;
  stopFindInPage(action: "clearSelection" | "keepSelection" | "activateSelection"): void;
  print(): Promise<void>;
  openDevTools(): void;
  executeJavaScript(code: string): Promise<unknown>;
  capturePage(): Promise<NativeImageLike>;
  getWebContentsId(): number;
};

type ElectronEvent<T> = Event & T;

export type PoolEntry = {
  key: string;
  partition: string;
  wrapper: HTMLDivElement;
  view: WebviewTag;
  props: WebViewProps;
  owner: symbol | null;
  placeholder: HTMLElement | null;
  visible: boolean;
  ready: boolean;
  browserId: number;
  themeColor: string | null;
  lastRect: string;
  /** The page a slept tab returns to; its guest is gone until the tab shows again. */
  discarded: string | null;
  revealFrame: number;
};

const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5,
];

let root: HTMLElement | null = null;
let layer: HTMLDivElement | null = null;
let nextBrowserId = 1;
const entries = new Map<string, PoolEntry>();
const byWebContents = new Map<number, PoolEntry>();
const favicons = new Map<string, string>();
// Pages the app shows outside the browser window, over its own elements (a split pane).
const externals = new Map<string, HTMLElement>();

/** The channel a page's preload forwards trackpad scrolls on; see apps/desktop/src/preview-pick-preload.ts. */
export const PAGE_WHEEL_CHANNEL = "rome:page-wheel";
let pageWheelListener: ((key: string, view: HTMLElement, input: unknown) => void) | null = null;
/** Hears the trackpad scrolls pages forward, by tab. */
export function onPageWheel(listener: typeof pageWheelListener) {
  pageWheelListener = listener;
}
// While the browser window is hidden, its own pages stay drawn but can't be seen.
let parked = false;

export const knownFavicon = (pageUrl: string) => favicons.get(pageUrl) ?? null;

let pruning = false;

export function attachPool(windowElement: HTMLElement) {
  root = windowElement;
  // Subscribed here rather than at import: the store and this module import each
  // other through @ardia/ardiacore, so the store is not initialized at that point.
  if (!pruning) {
    pruning = true;
    useBrowser.subscribe((s, prev) => {
      if (s.tabs !== prev.tabs) prune((key) => !!s.tabs[key]);
    });
  }
  if (!layer) {
    layer = document.createElement("div");
    layer.dataset.ardiaWebviews = "";
    // Fixed, so a page can also be placed over the app outside the browser window.
    Object.assign(layer.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "5",
      overflow: "hidden",
    });
  }
  if (layer.parentElement !== root) root.append(layer);
  for (const entry of entries.values())
    if (entry.wrapper.parentElement !== layer) layer.append(entry.wrapper);
  schedule();
}

export function partitionFor(profile: string | undefined): string {
  if (!profile) return "persist:ardia-default";
  if (profile.startsWith("incognito:")) {
    let hash = 0;
    for (const char of profile) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
    return `ardia-incog-${(hash >>> 0).toString(36)}`;
  }
  return `persist:ardia-${profile.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 90)}`;
}

const safely = <T>(entry: PoolEntry, read: (view: WebviewTag) => T, fallback: T): T => {
  if (!entry.ready) return fallback;
  try {
    return read(entry.view);
  } catch {
    return fallback;
  }
};

function report(entry: PoolEntry) {
  if (!entry.ready) return;
  const url = safely(entry, (v) => v.getURL(), "");
  const state: NavigationState = {
    url,
    title: safely(entry, (v) => v.getTitle(), "") || url,
    canGoBack: safely(entry, (v) => v.canGoBack(), false),
    canGoForward: safely(entry, (v) => v.canGoForward(), false),
    isLoading: safely(entry, (v) => v.isLoading(), false),
    themeColor: entry.themeColor,
    themeColorSource: entry.themeColor ? "meta" : null,
  };
  entry.props.onNavigationChange?.(state);
}

function reportZoom(entry: PoolEntry) {
  const zoom = safely(entry, (v) => v.getZoomFactor(), 1);
  let host = "";
  try {
    host = new URL(safely(entry, (v) => v.getURL(), "")).host;
  } catch {}
  entry.props.onZoom?.({ zoom, host, isDefault: Math.abs(zoom - 1) < 0.001, pinchScale: 1 });
}

const CRASH_REASONS: Record<string, CrashInfo["reason"]> = {
  "abnormal-exit": "abnormal",
  killed: "killed",
  crashed: "crashed",
  oom: "oom",
  "launch-failed": "launchFailed",
  "integrity-failure": "integrity",
};

function listen(entry: PoolEntry) {
  const { view } = entry;
  const on = <T>(name: string, handler: (event: ElectronEvent<T>) => void) =>
    view.addEventListener(name, handler as EventListener);
  // Trackpad scrolls the page forwards for swipe navigation (preview-pick-preload).
  view.addEventListener("ipc-message", (event) => {
    if (event.channel === PAGE_WHEEL_CHANNEL) pageWheelListener?.(entry.key, view, event.args[0]);
  });
  on("dom-ready", () => {
    const first = !entry.ready;
    entry.ready = true;
    if (first) {
      try {
        const id = view.getWebContentsId();
        byWebContents.set(id, entry);
      } catch {}
    }
    report(entry);
  });
  on("did-start-loading", () => {
    entry.props.onProgress?.(0.1);
    report(entry);
  });
  on("did-stop-loading", () => {
    entry.props.onProgress?.(1);
    report(entry);
  });
  on<{ url: string }>("did-navigate", () => {
    entry.themeColor = null;
    report(entry);
    reportZoom(entry);
  });
  on<{ isMainFrame: boolean }>("did-navigate-in-page", (e) => e.isMainFrame && report(entry));
  on("page-title-updated", () => report(entry));
  on<{ themeColor: string | null }>("did-change-theme-color", (e) => {
    entry.themeColor = e.themeColor || null;
    report(entry);
  });
  on<{ favicons: string[] }>("page-favicon-updated", (e) => {
    const [first] = e.favicons;
    if (!first) return;
    const page = safely(entry, (v) => v.getURL(), "");
    if (page) favicons.set(page, first);
    entry.props.onFavicon?.(first, e.favicons);
  });
  on<{ errorCode: number; errorDescription: string; validatedURL: string; isMainFrame: boolean }>(
    "did-fail-load",
    (e) => {
      // -3 is ERR_ABORTED: a navigation replaced by another one, not a failure.
      if (!e.isMainFrame || e.errorCode === -3) return;
      entry.props.onLoadError?.({
        url: e.validatedURL,
        code: e.errorCode,
        text: e.errorDescription,
      });
    },
  );
  on<{ details: { reason: string; exitCode: number } }>("render-process-gone", (e) => {
    entry.ready = false;
    entry.props.onCrashed?.({
      status: e.details.exitCode,
      reason: CRASH_REASONS[e.details.reason] ?? "unknown",
      code: e.details.exitCode,
    });
  });
  on("unresponsive", () => entry.props.onUnresponsive?.());
  on("responsive", () => entry.props.onResponsive?.());
  on("enter-html-full-screen", () => entry.props.onFullscreen?.(true));
  on("leave-html-full-screen", () => entry.props.onFullscreen?.(false));
  on<{ result: { activeMatchOrdinal: number; matches: number; finalUpdate: boolean } }>(
    "found-in-page",
    (e) =>
      entry.props.onFindResult?.({
        count: e.result.matches,
        active: e.result.activeMatchOrdinal,
        final: e.result.finalUpdate,
      }),
  );
  on<{ url: string }>("update-target-url", (e) => entry.props.onStatus?.(e.url));
  // Playing state comes from the main process (onAudible below): a page's media
  // events also fire for silent and muted videos, and one pausing doesn't mean all did.
  on("focus", () => entry.props.onPageFocus?.());
  on("close", () => entry.props.onWindowClose?.());
}

function createView(entry: PoolEntry, url: string | undefined) {
  const view = document.createElement("webview") as WebviewTag;
  view.setAttribute("partition", entry.partition);
  // Without it the guest attaches with popups disabled and window.open() is
  // refused before the main process can turn it into a tab or an OAuth popup.
  view.setAttribute("allowpopups", "true");
  view.src = url && url !== "about:blank" ? url : "about:blank";
  Object.assign(view.style, { display: "flex", width: "100%", height: "100%", border: "0" });
  entry.view = view;
  entry.ready = false;
  listen(entry);
  entry.wrapper.append(view);
}

function create(key: string, props: WebViewProps): PoolEntry {
  const wrapper = document.createElement("div");
  wrapper.dataset.ardiaTab = key;
  Object.assign(wrapper.style, {
    position: "absolute",
    left: "-100000px",
    top: "0",
    width: "800px",
    height: "600px",
    visibility: "hidden",
    pointerEvents: "none",
    overflow: "hidden",
    background: props.contentsBackgroundColor ?? "#FFFFFF",
  });

  const entry: PoolEntry = {
    key,
    partition: partitionFor(props.profile),
    wrapper,
    view: null as unknown as WebviewTag,
    props,
    owner: null,
    placeholder: null,
    visible: false,
    ready: false,
    browserId: nextBrowserId++,
    themeColor: null,
    lastRect: "",
    discarded: null,
    revealFrame: 0,
  };
  createView(entry, props.url);
  entries.set(key, entry);
  layer?.append(wrapper);
  return entry;
}

function forgetWebContents(entry: PoolEntry) {
  for (const [id, candidate] of byWebContents) if (candidate === entry) byWebContents.delete(id);
}

/** Ardia's tab sleeping: drops the guest and its renderer, keeping where it was. */
function discard(entry: PoolEntry): "discarded" | "unsupported" {
  if (entry.discarded !== null || entry.visible || externals.has(entry.key)) return "unsupported";
  const url = safely(entry, (v) => v.getURL(), "") || entry.view.src;
  forgetWebContents(entry);
  entry.view.remove();
  entry.ready = false;
  entry.themeColor = null;
  entry.discarded = url;
  entry.props.onDiscarded?.(url);
  return "discarded";
}

function wake(entry: PoolEntry) {
  if (entry.discarded === null) return;
  const url = entry.discarded;
  entry.discarded = null;
  createView(entry, url);
  entry.props.onReady?.(entry.browserId, entry.browserId);
}

function destroy(entry: PoolEntry) {
  entries.delete(entry.key);
  forgetWebContents(entry);
  entry.wrapper.remove();
}

export function acquire(
  key: string,
  props: WebViewProps,
  owner: symbol,
): { entry: PoolEntry; reused: boolean } {
  let entry = entries.get(key);
  if (entry && entry.partition !== partitionFor(props.profile)) {
    destroy(entry);
    entry = undefined;
  }
  const reused = !!entry;
  entry ??= create(key, props);
  entry.owner = owner;
  entry.props = props;
  return { entry, reused };
}

export function release(entry: PoolEntry, owner: symbol, dispose: boolean) {
  if (entry.owner !== owner) return;
  entry.owner = null;
  entry.placeholder = null;
  entry.visible = false;
  // A closed tab is gone from the store before its view unmounts, so the prune
  // that ran on that change skipped it while it was still owned.
  if (dispose || !useBrowser.getState().tabs[entry.key]) destroy(entry);
  else place(entry);
}

export function present(
  entry: PoolEntry,
  owner: symbol,
  placeholder: HTMLElement | null,
  visible: boolean,
) {
  if (entry.owner !== owner) return;
  entry.placeholder = placeholder;
  entry.visible = visible && !!placeholder;
  entry.lastRect = "";
  if (entry.visible) wake(entry);
  place(entry);
  schedule();
}

/** Shows a tab's page over `element`, wherever it is in the window; null hands it back. */
export function showPageAt(key: string, element: HTMLElement | null) {
  if (element) externals.set(key, element);
  else externals.delete(key);
  const entry = entries.get(key);
  if (entry) {
    entry.lastRect = "";
    if (element) wake(entry);
    place(entry);
  }
  schedule();
}

/** Whether the browser window is hidden; its pages then stay drawn, unseen. */
export function setParked(next: boolean) {
  if (parked === next) return;
  parked = next;
  for (const entry of entries.values()) {
    entry.lastRect = "";
    place(entry);
  }
  schedule();
}

const cornerOf = (element: Element | null) => {
  if (!element) return "";
  const style = getComputedStyle(element);
  return `0 0 ${style.borderBottomRightRadius} ${style.borderBottomLeftRadius}`;
};

// Pages an agent is working in. Out of view they stay drawn: transparent, behind
// everything and inside the window, since Chromium draws no frames for a page that
// is hidden or off screen, and the agent's snapshots need one.
const agentDriven = new Set<string>();

/** Keeps a tab's page drawn while it's out of view, for an agent working in it. */
export function setAgentDriven(key: string, driven: boolean) {
  if (driven === agentDriven.has(key)) return;
  if (driven) agentDriven.add(key);
  else agentDriven.delete(key);
  const entry = entries.get(key);
  if (entry) {
    entry.lastRect = "";
    place(entry);
  }
}

function place(entry: PoolEntry) {
  const style = entry.wrapper.style;
  const external = externals.get(entry.key);
  const target = external?.isConnected ? external : entry.visible ? entry.placeholder : null;
  if (!target || !layer) {
    if (entry.revealFrame) cancelAnimationFrame(entry.revealFrame);
    entry.revealFrame = 0;
    const drawn = agentDriven.has(entry.key);
    Object.assign(style, {
      left: drawn ? "0px" : "-100000px",
      top: "0px",
      zIndex: drawn ? "-1" : "",
      visibility: drawn ? "visible" : "hidden",
      pointerEvents: "none",
      opacity: drawn ? "0" : "",
    });
    entry.lastRect = "";
    return;
  }
  const base = layer.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const unseen = !external && parked;
  const next = `${Math.round(rect.left - base.left)},${Math.round(rect.top - base.top)},${Math.round(rect.width)},${Math.round(rect.height)},${unseen ? 1 : 0}`;
  if (next === entry.lastRect) return;
  entry.lastRect = next;
  const [left, top, width, height] = next.split(",");
  const revealing = style.visibility !== "visible";
  Object.assign(style, {
    zIndex: "",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    visibility: "visible",
    pointerEvents: unseen ? "none" : "auto",
    // The page takes the bottom corners of the card it fills.
    borderRadius: cornerOf(external ?? root?.closest("[data-ardia-host]") ?? null),
    ...(revealing || unseen ? { opacity: "0" } : entry.revealFrame ? {} : { opacity: "" }),
  });
  // The page in view is the active tab for extensions.
  if (revealing && !unseen && entry.ready) {
    try {
      desktop?.tabShown?.(entry.view.getWebContentsId());
    } catch {}
  }
  // A hidden guest takes its new size only once Chromium sees it again, and until
  // it draws at that size the window shows its last, wider frame. Transparent, it
  // counts as seen; it turns opaque two frames later, once it has drawn.
  if (revealing) {
    entry.revealFrame = requestAnimationFrame(() => {
      entry.revealFrame = requestAnimationFrame(() => {
        entry.revealFrame = 0;
        style.opacity = parked && !externals.has(entry.key) ? "0" : "";
      });
    });
  }
}

// Panes move with JS-driven springs that never resize the placeholder, so a
// ResizeObserver would miss them. Only shown guests are measured, so a frame is
// a handful of getBoundingClientRect calls.
let frame = 0;
function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(tick);
}

function tick() {
  frame = 0;
  let any = false;
  for (const entry of entries.values()) {
    if (!entry.visible && !externals.has(entry.key)) continue;
    any = true;
    place(entry);
  }
  if (any) schedule();
}

export function prune(liveKeys: (key: string) => boolean) {
  for (const entry of [...entries.values()])
    if (!entry.owner && !liveKeys(entry.key)) destroy(entry);
}

const DISPOSITIONS: Record<DesktopOpenWindow["disposition"], OpenDisposition> = {
  default: "foreground",
  "foreground-tab": "foreground",
  "background-tab": "background",
  "new-window": "window",
  other: "foreground",
};

desktop?.onOpenWindow((request) => {
  const entry = byWebContents.get(request.webContentsId);
  entry?.props.onOpenWindow?.({
    url: request.url,
    disposition: DISPOSITIONS[request.disposition] ?? "foreground",
    userGesture: true,
  });
});

desktop?.onAudible?.((event) => {
  const entry = byWebContents.get(event.webContentsId);
  entry?.props.onMedia?.({
    playing: event.audible,
    muted: safely(entry, (v) => v.isAudioMuted(), false),
  });
});

// Extensions switch to and close tabs through the browser, like the user would.
desktop?.onExtensionTab?.((request) => {
  const entry = byWebContents.get(request.webContentsId);
  if (request.action === "activate") entry?.props.onActivateRequest?.();
  else entry?.props.onWindowClose?.();
});

/** What extensions need to know about a tab's page: its session and its guest. */
export function pageEngine(key: string): { partition: string; webContentsId: number } | null {
  const entry = entries.get(key);
  if (!entry?.ready) return null;
  try {
    return { partition: entry.partition, webContentsId: entry.view.getWebContentsId() };
  } catch {
    return null;
  }
}

export function handleFor(entry: () => PoolEntry | null): WebViewHandle {
  const done = Promise.resolve();
  const run = (action: (view: WebviewTag, current: PoolEntry) => void) => {
    const current = entry();
    if (!current) return done;
    try {
      action(current.view, current);
    } catch {}
    return done;
  };
  const handle: Partial<WebViewHandle> = {
    nativeTag: () => null,
    loadUrl: async (url) => {
      const current = entry();
      if (!current) return;
      if (current.ready) await current.view.loadURL(url).catch(() => {});
      else current.view.src = url;
    },
    goBack: () => run((v) => v.goBack()),
    goForward: () => run((v) => v.goForward()),
    goToOffset: (offset) => run((v) => v.goToOffset(offset)),
    reload: () => run((v) => v.reload()),
    forceReload: () => run((v) => v.reloadIgnoringCache()),
    stopLoading: () => run((v) => v.stop()),
    focus: () => run((v) => v.focus()),
    setMuted: (muted) => run((v) => v.setAudioMuted(muted)),
    zoomStep: (direction) =>
      run((v, current) => {
        const zoom = v.getZoomFactor();
        const next =
          direction === 0
            ? 1
            : direction > 0
              ? (ZOOM_STEPS.find((step) => step > zoom + 0.001) ?? zoom)
              : ([...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.001) ?? zoom);
        v.setZoomFactor(next);
        reportZoom(current);
      }),
    find: (text, forward, findNext) => run((v) => void v.findInPage(text, { forward, findNext })),
    stopFinding: (clearSelection) =>
      run((v) => v.stopFindInPage(clearSelection ? "clearSelection" : "keepSelection")),
    print: () => run((v) => void v.print()),
    showDevTools: () => run((v) => v.openDevTools()),
    executeJavaScript: async (code) => {
      const current = entry();
      if (current?.ready) await current.view.executeJavaScript(code).catch(() => {});
    },
    evaluate: async <T>(code: string) => {
      const current = entry();
      if (!current?.ready) return null;
      return ((await current.view.executeJavaScript(code).catch(() => null)) ?? null) as T | null;
    },
    navigationEntries: async () => {
      const current = entry();
      if (!current?.ready) return [];
      return [{ url: current.view.getURL(), title: current.view.getTitle(), current: true }];
    },
    capturePicture: async (scale) => {
      const current = entry();
      if (!current?.ready || !current.visible) return null;
      try {
        const image = await current.view.capturePage();
        const size = image.getSize();
        const scaled =
          scale > 0 && scale < 1
            ? image.resize({ width: Math.max(1, Math.round(size.width * scale)) })
            : image;
        const data = scaled.toDataURL().replace(/^data:[^,]*,/, "");
        const [left, top, width, height] = (current.lastRect || "0,0,0,0").split(",").map(Number);
        return { data, frame: [left!, top!, width!, height!] };
      } catch {
        return null;
      }
    },
    getSecurityInfo: async () => {
      const current = entry();
      const url = current?.ready ? current.view.getURL() : "";
      let origin: string | null = null;
      let protocol = "";
      try {
        const parsed = new URL(url);
        origin = parsed.origin;
        protocol = parsed.protocol;
      } catch {}
      const level = protocol === "https:" ? "secure" : protocol === "file:" ? "local" : "none";
      return { level, url, origin };
    },
    discard: async () => {
      const current = entry();
      return current ? discard(current) : "unsupported";
    },
  };
  return new Proxy(handle, {
    get: (target, key) => (key in target ? target[key as keyof WebViewHandle] : () => done),
  }) as WebViewHandle;
}
