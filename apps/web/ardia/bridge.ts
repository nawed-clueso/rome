// The main-process side lives in apps/desktop/src/ardia (ArdiaGuests.ts, DiaImport.ts).

export type DesktopOpenWindow = {
  webContentsId: number;
  url: string;
  disposition: "default" | "foreground-tab" | "background-tab" | "new-window" | "other";
};

export type DesktopShortcutInput = {
  code: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

export type DesktopDiaOperation = "status" | "read" | "open" | "openAutomationSettings";
export type DesktopDiaReply =
  | { ok: true; value: unknown }
  | { ok: false; code: string; message: string };

type ArdiaDesktopBridge = {
  setShortcuts(table: { code: string; mods: string[] }[]): void;
  onOpenWindow(listener: (request: DesktopOpenWindow) => void): () => void;
  onShortcut(listener: (input: DesktopShortcutInput) => void): () => void;
  /** Present on macOS builds only; see apps/desktop/src/ardia/DiaImport.ts. */
  dia?(operation: DesktopDiaOperation): Promise<DesktopDiaReply>;
  /** Reads another browser's spaces, favourites and history; see apps/desktop/src/ardia/BrowserMigration.ts. */
  migrate?(operation: "list" | "read", browserId?: string, profileId?: string): Promise<unknown>;
  /** Opens or focuses another browser window ("main" focuses the main one), or lists them. */
  windows?(operation: "open" | "focus" | "list", romeWindowId?: string): Promise<unknown>;
  /** In the main window: another browser window closed, by its id. */
  onWindowClosed?(listener: (romeWindowId: string) => void): () => void;
  /** Fetches a search engine's suggestions, which the page itself may not (CORS). */
  suggest?(url: string): Promise<{ ok: boolean; text: string }>;
  /** Shows or hides the macOS window buttons. */
  setWindowControlsVisible?(visible: boolean): void;
  /** Whether a tab is making sound, as Chromium hears it. */
  onAudible?(listener: (event: { webContentsId: number; audible: boolean }) => void): () => void;
  /** An extension asking to switch to or close a tab. */
  onExtensionTab?(
    listener: (request: { webContentsId: number; action: "activate" | "close" }) => void,
  ): () => void;
  /** Tells extensions which tab is in view. */
  tabShown?(webContentsId: number): void;
  /** Runs the annotation overlay in a tab; resolves with what was picked, or null. */
  pickElement?(webContentsId: number, theme: unknown): Promise<unknown>;
  cancelPick?(webContentsId: number): void;
  /** The tab's visible page as a PNG data URL. */
  snapshot?(webContentsId: number): Promise<string | null>;
};

export const desktop: ArdiaDesktopBridge | null =
  (globalThis as { ardiaDesktop?: ArdiaDesktopBridge }).ardiaDesktop ?? null;
