import * as Electron from "electron";

import { attachDebugger, guestOf } from "./ArdiaGuests.ts";
import { ARDIA_AGENT_INPUT_CHANNEL, ARDIA_AGENT_TAB_CHANNEL } from "./channels.ts";

// A chat's browser tabs, shared with that chat's agent. The server drives a shared
// tab over the tab's own debugger, through the same browser host the preview
// panel's tabs use, so the agent's preview tools work on it unchanged.

type TabKey = { readonly threadId: string; readonly tabId: string };

export type AgentTabsHost = {
  readonly attach: (
    key: TabKey,
    debuggee: { readonly webContents: Electron.WebContents; readonly debugger: Electron.Debugger },
  ) => void;
  readonly detach: (key: TabKey) => void;
  readonly onAgentInput: (listener: (webContents: Electron.WebContents) => void) => () => void;
};

// How often a tab's window hears that the agent is still at work in it.
const INPUT_NOTICE_MS = 1_000;

const KEY_PART = /^[\w:.-]{1,128}$/;

let installed = false;
export const installAgentTabsIpc = (host: AgentTabsHost): void => {
  if (installed) return;
  installed = true;
  const shared = new WeakSet<Electron.WebContents>();
  const noticedAt = new WeakMap<Electron.WebContents, number>();
  // The agent working in a shared tab is shown on the tab in Rome's sidebar.
  host.onAgentInput((guest) => {
    if (!shared.has(guest) || guest.isDestroyed()) return;
    const now = performance.now();
    if (now - (noticedAt.get(guest) ?? Number.NEGATIVE_INFINITY) < INPUT_NOTICE_MS) return;
    noticedAt.set(guest, now);
    const window = guest.hostWebContents;
    if (window && !window.isDestroyed()) window.send(ARDIA_AGENT_INPUT_CHANNEL, guest.id);
  });
  Electron.ipcMain.handle(
    ARDIA_AGENT_TAB_CHANNEL,
    (event, operation: unknown, threadId: unknown, tabId: unknown, webContentsId: unknown) => {
      if (typeof threadId !== "string" || typeof tabId !== "string") return false;
      if (!KEY_PART.test(threadId) || !KEY_PART.test(tabId)) return false;
      const key = { threadId, tabId };
      if (operation === "unshare") {
        if (event.sender.getType() !== "window") return false;
        host.detach(key);
        return true;
      }
      if (operation !== "share") return false;
      const guest = guestOf(event, webContentsId);
      if (!guest || !attachDebugger(guest)) return false;
      host.attach(key, { webContents: guest, debugger: guest.debugger });
      shared.add(guest);
      guest.once("destroyed", () => host.detach(key));
      return true;
    },
  );
};
