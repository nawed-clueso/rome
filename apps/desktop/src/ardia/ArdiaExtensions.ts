// @effect-diagnostics nodeBuiltinImport:off -- Electron extension callbacks run outside any Effect runtime, like ArdiaGuests.
// @effect-diagnostics globalTimers:off -- A new tab's wait times out inside an Electron callback, not an Effect fiber.
// @effect-diagnostics globalConsole:off -- Extension load failures are logged from a detached promise in the main process.
/**
 * Chrome extensions for the browser's tabs.
 *
 * Each space (an Ardia partition) keeps its own extensions, as Chrome profiles
 * do. They install from the Chrome Web Store ("Add to Chrome" on its pages) and
 * get the chrome.tabs, action, windows and related APIs from
 * electron-chrome-extensions; the tab strip they see is the browser's own tabs,
 * reached through the renderer.
 */
import * as Path from "node:path";

import * as Electron from "electron";
import type { ElectronChromeExtensions } from "electron-chrome-extensions";

import { ARDIA_EXTENSION_TAB_CHANNEL, ARDIA_OPEN_WINDOW_CHANNEL } from "./channels.ts";

interface SpaceExtensions {
  /** Null until the extension libraries have loaded. */
  extensions: ElectronChromeExtensions | null;
  readonly ready: Promise<void>;
  /** The window showing this space's tabs, and the tab it shows. */
  host: Electron.WebContents | null;
  selected: Electron.WebContents | null;
  /** Tabs an extension asked for, waiting for their page to attach. */
  readonly pending: ((tab: Electron.WebContents) => void)[];
}

const spaces = new Map<Electron.Session, SpaceExtensions>();
// Loaded on first use: they read Electron's main-process exports as they load.
const libraries = () =>
  Promise.all([import("electron-chrome-extensions"), import("electron-chrome-web-store")]);
const iconSessions = new WeakSet<Electron.Session>();
const NEW_TAB_TIMEOUT_MS = 15_000;

const windowOf = (contents: Electron.WebContents | null): Electron.BrowserWindow | null =>
  contents && !contents.isDestroyed() ? Electron.BrowserWindow.fromWebContents(contents) : null;

const extensionsPathFor = (partition: string) =>
  Path.join(
    Electron.app.getPath("userData"),
    "Extensions",
    partition.replace(/[^A-Za-z0-9_-]/g, "_"),
  );

const tellHost = (
  space: SpaceExtensions,
  tab: Electron.WebContents,
  action: "activate" | "close",
) => {
  if (space.host && !space.host.isDestroyed()) {
    space.host.send(ARDIA_EXTENSION_TAB_CHANNEL, { webContentsId: tab.id, action });
  }
};

/** Opens a tab for an extension, beside the space's current tab, and waits for its page. */
const openTab = (space: SpaceExtensions, url: string | undefined, active: boolean) =>
  new Promise<[Electron.WebContents, Electron.BaseWindow]>((resolve, reject) => {
    const from = space.selected && !space.selected.isDestroyed() ? space.selected : null;
    const window = windowOf(space.host);
    if (!from || !space.host || !window) {
      reject(new Error("No browser tab is open in this space."));
      return;
    }
    const timer = setTimeout(() => {
      const at = space.pending.indexOf(arrive);
      if (at >= 0) space.pending.splice(at, 1);
      reject(new Error("The tab did not open."));
    }, NEW_TAB_TIMEOUT_MS);
    const arrive = (tab: Electron.WebContents) => {
      clearTimeout(timer);
      resolve([tab, window]);
    };
    space.pending.push(arrive);
    space.host.send(ARDIA_OPEN_WINDOW_CHANNEL, {
      webContentsId: from.id,
      url: url ?? "about:blank",
      disposition: active ? "foreground-tab" : "background-tab",
    });
  });

/** Turns extensions on for a space's session, once. */
export const enableExtensions = (partition: string): void => {
  const session = Electron.session.fromPartition(partition);
  if (spaces.has(session)) return;
  const space: SpaceExtensions = {
    extensions: null,
    ready: libraries().then(([{ ElectronChromeExtensions }, { installChromeWebStore }]) => {
      space.extensions = new ElectronChromeExtensions({
        // Rome ships under the GPL along with the Ardia browser it is built on.
        license: "GPL-3.0",
        session,
        createTab: (details) => openTab(space, details.url, details.active !== false),
        selectTab: (tab) => tellHost(space, tab, "activate"),
        removeTab: (tab) => tellHost(space, tab, "close"),
        createWindow: async (details) => {
          const url = Array.isArray(details.url) ? details.url[0] : details.url;
          const [, window] = await openTab(space, url, details.focused !== false);
          return window;
        },
      });
      void installChromeWebStore({ session, extensionsPath: extensionsPathFor(partition) }).catch(
        (error: unknown) => console.warn("[rome] extensions did not load", error),
      );
    }),
    host: null,
    selected: null,
    pending: [],
  };
  space.ready.catch((error: unknown) =>
    console.warn("[rome] extension support did not start", error),
  );
  spaces.set(session, space);
};

/** Starts tracking a tab of a space with extensions; called as its page attaches. */
export const addExtensionTab = (host: Electron.WebContents, guest: Electron.WebContents): void => {
  const space = spaces.get(guest.session);
  if (!space) return;
  void space.ready.then(async () => {
    const window = windowOf(host);
    if (!space.extensions || !window || guest.isDestroyed()) return;
    if (!iconSessions.has(host.session)) {
      // The toolbar draws extension icons from crx:// URLs in the app's own session.
      iconSessions.add(host.session);
      const { ElectronChromeExtensions } = await import("electron-chrome-extensions");
      ElectronChromeExtensions.handleCRXProtocol(host.session);
    }
    trackTab(space, host, guest, window);
  });
};

const trackTab = (
  space: SpaceExtensions,
  host: Electron.WebContents,
  guest: Electron.WebContents,
  window: Electron.BrowserWindow,
) => {
  space.host = host;
  space.extensions?.addTab(guest, window);
  const waiting = space.pending.shift();
  if (waiting) waiting(guest);
  space.selected ??= guest;
  guest.on("focus", () => noteShownTab(guest));
  guest.once("destroyed", () => {
    if (space.selected === guest) space.selected = null;
  });
};

/** The tab the user is looking at in its space, for chrome.tabs' "active" tab. */
export const noteShownTab = (guest: Electron.WebContents): void => {
  const space = spaces.get(guest.session);
  if (!space || guest.isDestroyed() || space.selected === guest) return;
  space.selected = guest;
  space.extensions?.selectTab(guest);
};

/** Answers the renderer when a tab comes into view. */
export const installExtensionIpc = (channel: string): void => {
  Electron.ipcMain.on(channel, (event, webContentsId: unknown) => {
    if (event.sender.getType() !== "window" || typeof webContentsId !== "number") return;
    const guest = Electron.webContents.fromId(webContentsId);
    if (guest && guest.hostWebContents === event.sender) noteShownTab(guest);
  });
};
