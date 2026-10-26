/**
 * Guest pages of the Ardia browser panel.
 *
 * Ardia's tabs are plain `<webview>` elements in the host renderer, one partition
 * per Ardia profile (space). They are not preview sessions: the preview manager
 * never sees them, so this module gives them the two things a browser tab needs
 * from the main process: links that open new tabs, and browser shortcuts that
 * still work while the page has focus.
 */
import * as Electron from "electron";

import { previewWindowOpenAction } from "../preview/Manager.ts";
import { addExtensionTab, enableExtensions, installExtensionIpc } from "./ArdiaExtensions.ts";
import { cancelPick, pickInGuest, snapshotGuest } from "./ArdiaPick.ts";
import { installBrowserMigrationIpc } from "./BrowserMigration.ts";
import { installDiaImportIpc } from "./DiaImport.ts";
import { isSignInLocation, SIGN_IN_PERSONA_ARGUMENT } from "./SignInPersona.ts";
import {
  ARDIA_AUDIBLE_CHANNEL,
  ARDIA_CANCEL_PICK_CHANNEL,
  ARDIA_OPEN_WINDOW_CHANNEL,
  ARDIA_PICK_CHANNEL,
  ARDIA_SET_SHORTCUTS_CHANNEL,
  ARDIA_SNAPSHOT_CHANNEL,
  ARDIA_SHORTCUT_CHANNEL,
  ARDIA_SUGGEST_CHANNEL,
  ARDIA_TAB_SHOWN_CHANNEL,
  ARDIA_WINDOW_CONTROLS_CHANNEL,
} from "./channels.ts";

const ARDIA_PARTITION = /^(persist:)?ardia-[A-Za-z0-9_-]{1,96}$/;

export const isArdiaPartition = (partition: string): boolean => ARDIA_PARTITION.test(partition);

const POPUP_WINDOW_OPTIONS = {
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
} satisfies Electron.BrowserWindowConstructorOptions;

type Mod = "cmd" | "shift" | "alt" | "ctrl";
interface Shortcut {
  readonly code: string;
  readonly mods: readonly Mod[];
}

const isMac = process.platform === "darwin";
let shortcuts: readonly Shortcut[] = [];
const ardiaSessions = new WeakSet<Electron.Session>();

const modsOf = (input: Electron.Input): Set<Mod> => {
  const mods = new Set<Mod>();
  if (isMac ? input.meta : input.control) mods.add("cmd");
  if (isMac && input.control) mods.add("ctrl");
  if (!isMac && input.meta) mods.add("ctrl");
  if (input.alt) mods.add("alt");
  if (input.shift) mods.add("shift");
  return mods;
};

const matchesShortcut = (input: Electron.Input): boolean => {
  if (input.type !== "keyDown") return false;
  // Bare keys and Shift-only chords belong to the page, except function keys.
  const mods = modsOf(input);
  const chord = [...mods].some((mod) => mod !== "shift") || /^F\d{1,2}$/.test(input.code);
  if (!chord) return false;
  return shortcuts.some(
    (shortcut) =>
      shortcut.code === input.code &&
      shortcut.mods.length === mods.size &&
      shortcut.mods.every((mod) => mods.has(mod)),
  );
};

const parseShortcuts = (value: unknown): readonly Shortcut[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): Shortcut[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const { code, mods } = entry as { code?: unknown; mods?: unknown };
    if (typeof code !== "string" || !Array.isArray(mods)) return [];
    const valid = mods.filter(
      (mod): mod is Mod => mod === "cmd" || mod === "shift" || mod === "alt" || mod === "ctrl",
    );
    return [{ code, mods: valid }];
  });
};

// The search engines' suggestion endpoints, the only hosts the address bar may ask.
const SUGGEST_HOSTS = new Set([
  "suggestqueries.google.com",
  "api.bing.com",
  "duckduckgo.com",
  "ac.ecosia.org",
  "search.brave.com",
  "www.startpage.com",
  "search.yahoo.com",
  "www.baidu.com",
  "suggest.yandex.com",
]);
const SUGGEST_TIMEOUT_MS = 4_000;

const fetchSuggestions = async (raw: unknown): Promise<{ ok: boolean; text: string }> => {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    return { ok: false, text: "" };
  }
  if (url.protocol !== "https:" || !SUGGEST_HOSTS.has(url.host)) return { ok: false, text: "" };
  try {
    const response = await Electron.net.fetch(url.href, {
      signal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS),
      credentials: "omit",
    });
    return { ok: response.ok, text: response.ok ? await response.text() : "" };
  } catch {
    return { ok: false, text: "" };
  }
};

let ipcInstalled = false;

// Sites such as WhatsApp Web and Google sign-in turn away anything that names
// Electron or an unknown app, so tabs present themselves as the Chrome they run.
const chromeUserAgent = (userAgent: string): string =>
  userAgent.replace(/\s(?:Electron|T3Code[A-Za-z]*|Rome[A-Za-z]*)\/\S+/g, "");

// Absent outside Electron, as in unit tests.
const CHROME_VERSION = process.versions.chrome ?? "0.0.0.0";
const CHROME_MAJOR = CHROME_VERSION.split(".")[0] ?? "0";
const UA_PLATFORM: Record<string, string> = { darwin: "macOS", win32: "Windows", linux: "Linux" };

// Google sign-in lets Firefox in where it turns embedded Chromium away (see SignInPersona).
const FIREFOX_VERSION = `${Number(CHROME_MAJOR) + 2}.0`;
const FIREFOX_PLATFORM: Record<string, string> = {
  darwin: "Macintosh; Intel Mac OS X 10.15",
  win32: "Windows NT 10.0; Win64; x64",
  linux: "X11; Linux x86_64",
};
const FIREFOX_USER_AGENT = `Mozilla/5.0 (${FIREFOX_PLATFORM[process.platform] ?? FIREFOX_PLATFORM.linux}; rv:${FIREFOX_VERSION}) Gecko/20100101 Firefox/${FIREFOX_VERSION}`;

/** The argument that has a tab's preload hide Chromium on the sign-in pages. */
export const SIGN_IN_PERSONA = `${SIGN_IN_PERSONA_ARGUMENT}=${FIREFOX_USER_AGENT}`;

const isSignInPage = (url: string): boolean => {
  try {
    return isSignInLocation(new URL(url));
  } catch {
    return false;
  }
};

/** A browser tab the asking window hosts, by its id; null for anything else. */
export const guestOf = (
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  id: unknown,
) => {
  if (event.sender.getType() !== "window" || typeof id !== "number") return null;
  const guest = Electron.webContents.fromId(id);
  return guest &&
    !guest.isDestroyed() &&
    isArdiaGuest(guest) &&
    guest.hostWebContents === event.sender
    ? guest
    : null;
};

export const attachDebugger = (contents: Electron.WebContents): boolean => {
  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
    return true;
  } catch {
    return false;
  }
};

const presentAsFirefox = (contents: Electron.WebContents): void => {
  if (!attachDebugger(contents)) return;
  void contents.debugger
    .sendCommand("Emulation.setUserAgentOverride", { userAgent: FIREFOX_USER_AGENT })
    .catch(() => {});
};

/**
 * The user-agent string is not all a site reads: Chromium also reports brands
 * (Sec-CH-UA, navigator.userAgentData), which name only "Chromium" here, and
 * many sites refuse a browser whose brands don't say Chrome. The DevTools
 * protocol sets the whole identity, as Chrome itself would report it.
 */
const presentAsChrome = (contents: Electron.WebContents): void => {
  if (!attachDebugger(contents)) return;
  const brands = [
    { brand: "Google Chrome", version: CHROME_MAJOR },
    { brand: "Chromium", version: CHROME_MAJOR },
    { brand: "Not?A_Brand", version: "24" },
  ];
  void contents.debugger
    .sendCommand("Emulation.setUserAgentOverride", {
      userAgent: chromeUserAgent(contents.getUserAgent()),
      userAgentMetadata: {
        brands,
        fullVersionList: brands.map(({ brand, version }) => ({
          brand,
          version: brand === "Not?A_Brand" ? `${version}.0.0.0` : CHROME_VERSION,
        })),
        fullVersion: CHROME_VERSION,
        platform: UA_PLATFORM[process.platform] ?? "Unknown",
        platformVersion: process.getSystemVersion(),
        architecture: process.arch === "arm64" ? "arm" : "x86",
        bitness: "64",
        model: "",
        mobile: false,
        wow64: false,
      },
    })
    .catch(() => {});
};

/** Presents the identity a page needs: Firefox on Google sign-in, Chrome everywhere else. */
const presentFor = (contents: Electron.WebContents, url: string): void => {
  if (isSignInPage(url)) presentAsFirefox(contents);
  else presentAsChrome(contents);
};

/** Keeps a tab's identity right for each page it goes to, before the page loads. */
const followNavigations = (contents: Electron.WebContents): void => {
  let signIn: boolean | null = null;
  const update = (url: string) => {
    const next = isSignInPage(url);
    if (next === signIn) return;
    signIn = next;
    presentFor(contents, url);
  };
  update(contents.getURL());
  contents.on("did-start-navigation", (details) => {
    if (details.isMainFrame) update(details.url);
  });
};

/** Called from `will-attach-webview` once the partition has been admitted. */
export const noteArdiaPartition = (partition: string): void => {
  const session = Electron.session.fromPartition(partition);
  if (ardiaSessions.has(session)) return;
  ardiaSessions.add(session);
  session.setUserAgent(chromeUserAgent(session.getUserAgent()));
  // Requests to the sign-in pages, frames and redirects included, say Firefox
  // too, and carry none of the Chromium-only client hints.
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!isSignInPage(details.url)) return callback({ requestHeaders: details.requestHeaders });
    const requestHeaders = Object.fromEntries(
      Object.entries(details.requestHeaders).filter(([name]) => !/^sec-ch-ua/i.test(name)),
    );
    requestHeaders["User-Agent"] = FIREFOX_USER_AGENT;
    callback({ requestHeaders });
  });
  enableExtensions(partition);
};

export const isArdiaGuest = (contents: Electron.WebContents): boolean =>
  ardiaSessions.has(contents.session);

export const installArdiaIpc = (): void => {
  if (ipcInstalled) return;
  ipcInstalled = true;
  Electron.ipcMain.on(ARDIA_SET_SHORTCUTS_CHANNEL, (_event, table: unknown) => {
    shortcuts = parseShortcuts(table);
  });
  Electron.ipcMain.handle(ARDIA_SUGGEST_CHANNEL, (event, url: unknown) =>
    event.sender.getType() === "window" ? fetchSuggestions(url) : { ok: false, text: "" },
  );
  installDiaImportIpc();
  installBrowserMigrationIpc();
  installExtensionIpc(ARDIA_TAB_SHOWN_CHANNEL);
  // A full-window page hides the window buttons, as Arc does with its sidebar away.
  Electron.ipcMain.on(ARDIA_WINDOW_CONTROLS_CHANNEL, (event, visible: unknown) => {
    if (event.sender.getType() !== "window" || typeof visible !== "boolean" || !isMac) return;
    Electron.BrowserWindow.fromWebContents(event.sender)?.setWindowButtonVisibility(visible);
  });
  Electron.ipcMain.handle(ARDIA_PICK_CHANNEL, (event, id: unknown, theme: unknown) => {
    const guest = guestOf(event, id);
    if (!guest || typeof theme !== "object" || theme === null) return null;
    return pickInGuest(guest, theme as Parameters<typeof pickInGuest>[1]);
  });
  Electron.ipcMain.on(ARDIA_CANCEL_PICK_CHANNEL, (event, id: unknown) => {
    const guest = guestOf(event, id);
    if (guest) cancelPick(guest);
  });
  Electron.ipcMain.handle(ARDIA_SNAPSHOT_CHANNEL, (event, id: unknown) => {
    const guest = guestOf(event, id);
    return guest ? snapshotGuest(guest) : null;
  });
};

/** Wires one Ardia guest to its host renderer. */
export const prepareArdiaGuest = (
  host: Electron.WebContents,
  guest: Electron.WebContents,
): void => {
  const send = (channel: string, payload: unknown) => {
    if (!host.isDestroyed()) host.send(channel, payload);
  };

  followNavigations(guest);
  addExtensionTab(host, guest);
  // Whether the tab is making sound, as Chromium hears it: silent or muted
  // autoplay videos don't count, and it clears only when every sound stops.
  guest.on("audio-state-changed", ({ audible }) =>
    send(ARDIA_AUDIBLE_CHANNEL, { webContentsId: guest.id, audible }),
  );
  // Sign-in popups (Google, Apple, GitHub) need the same identity as the tab.
  guest.on("did-create-window", (popup) => followNavigations(popup.webContents));

  guest.setWindowOpenHandler((details) => {
    const action = previewWindowOpenAction(details);
    if (action === "deny") return { action: "deny" };
    if (action === "popup") {
      return { action: "allow", overrideBrowserWindowOptions: POPUP_WINDOW_OPTIONS };
    }
    if (action === "navigate") {
      void guest.loadURL(details.url).catch(() => {});
      return { action: "deny" };
    }
    send(ARDIA_OPEN_WINDOW_CHANNEL, {
      webContentsId: guest.id,
      url: details.url,
      disposition: details.disposition,
    });
    return { action: "deny" };
  });

  guest.on("before-input-event", (event, input) => {
    if (!matchesShortcut(input)) return;
    event.preventDefault();
    send(ARDIA_SHORTCUT_CHANNEL, {
      code: input.code,
      key: input.key,
      metaKey: input.meta,
      ctrlKey: input.control,
      altKey: input.alt,
      shiftKey: input.shift,
    });
  });
};
