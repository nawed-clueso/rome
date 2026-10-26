import * as Electron from "electron";

import { ROME_WINDOWS_CHANNEL } from "./channels.ts";

// Rome's browser windows: besides the main window, each shows the spaces it was
// opened for. The page decides what each window holds
// (apps/web/ardia/rome/windows.ts); the app opens, focuses and lists them.

export type RomeWindowsHost = {
  readonly open: (romeWindowId: string) => Promise<boolean>;
  readonly focus: (romeWindowId: string) => Promise<boolean>;
  readonly list: () => Promise<readonly string[]>;
};

const WINDOW_ID = /^[\w-]{1,64}$/;

let installed = false;
export const installRomeWindowsIpc = (host: RomeWindowsHost): void => {
  if (installed) return;
  installed = true;
  Electron.ipcMain.handle(
    ROME_WINDOWS_CHANNEL,
    async (event, operation: unknown, romeWindowId: unknown) => {
      if (event.sender.getType() !== "window") return null;
      if (operation === "list") return host.list();
      if (typeof romeWindowId !== "string" || !WINDOW_ID.test(romeWindowId)) return false;
      if (operation === "open") return host.open(romeWindowId);
      if (operation === "focus") return host.focus(romeWindowId);
      return null;
    },
  );
};
