// @effect-diagnostics nodeBuiltinImport:off -- A plain IPC handler that runs osascript and reads Dia's Local State outside any Effect runtime, like ArdiaGuests.
/**
 * Reads Dia's open and pinned tabs for the Ardia browser's importer.
 *
 * Native Ardia asks Dia over Apple Events (packages/import/ios/Core/DiaAppleEvents.swift);
 * this does the same through `osascript`, so the import window's "Dia" source works
 * in T3 Code. Dia's scripting interface only reaches tabs: profile names, URLs,
 * titles and whether a tab is pinned. Read only: nothing is ever sent to Dia but
 * property reads, and only T3 Code's own window may ask.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";

import * as Electron from "electron";

import { ARDIA_DIA_CHANNEL } from "./channels.ts";

const DIA_BUNDLE_ID = "company.thebrowser.dia";
const SCRIPT_TIMEOUT_MS = 15_000;

type Status = "granted" | "denied" | "notDetermined" | "notRunning" | "notInstalled";
type Failure = { code: "notRunning" | "locked" | "notFound" | "unreadable"; message: string };
type Reply = { ok: true; value: unknown } | ({ ok: false } & Failure);

type ScriptTab = { url: string | null; title: string | null; pinned: boolean; focused: boolean };
type ScriptWindow = {
  index: number;
  profiles: { name: string | null; index: number; tabs: ScriptTab[] }[];
};

type ImportedTab = {
  url: string;
  title: string;
  pinned: boolean;
  windowIndex: number;
  active: boolean;
};
type DiaTabsProfile = {
  id: string;
  name: string;
  index: number;
  pinned: ImportedTab[];
  tabs: ImportedTab[];
};

class ScriptFailure extends Error {
  readonly failure: Failure;

  constructor(failure: Failure) {
    super(failure.message);
    this.failure = failure;
  }
}

const PROBE_SCRIPT = `function run() {
  let app;
  try { app = Application(${JSON.stringify(DIA_BUNDLE_ID)}); } catch (e) { return "notInstalled"; }
  return app.running() ? "running" : "notRunning";
}`;

// Bulk reads (one Apple Event per property per level) keep a large session fast.
const COUNT_SCRIPT = `function run() { return String(Application(${JSON.stringify(DIA_BUNDLE_ID)}).windows.length); }`;

const READ_SCRIPT = `function run() {
  const dia = Application(${JSON.stringify(DIA_BUNDLE_ID)});
  return JSON.stringify(dia.windows().map((w, wi) => ({
    index: w.index(),
    profiles: w.profiles().map((p, pi) => {
      const tabs = p.tabs;
      const urls = tabs.url(), titles = tabs.title(), pinned = tabs.ispinned(), focused = tabs.isfocused();
      return { name: p.name(), index: p.index() || pi + 1, tabs: urls.map((url, i) => ({ url, title: titles[i], pinned: !!pinned[i], focused: !!focused[i] })) };
    }),
  })));
}`;

const runScript = (source: string): Promise<string> =>
  new Promise((resolve, reject) => {
    NodeChildProcess.execFile(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", source],
      { timeout: SCRIPT_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout.trim());
        const text = `${stderr} ${error.message}`;
        if (error.killed) {
          reject(new ScriptFailure({ code: "unreadable", message: "Dia didn't answer in time" }));
        } else if (/-1743|-1744|Not authori[sz]ed/i.test(text)) {
          reject(
            new ScriptFailure({
              code: "locked",
              message: "macOS didn't allow Rome to read Dia's tabs",
            }),
          );
        } else if (/-600|-609|isn.t running/i.test(text)) {
          reject(new ScriptFailure({ code: "notRunning", message: "Dia isn't running" }));
        } else {
          reject(new ScriptFailure({ code: "unreadable", message: "Dia couldn't list its tabs" }));
        }
      },
    );
  });

const probe = async (): Promise<Status | "running"> => {
  const state = await runScript(PROBE_SCRIPT);
  return state === "running" || state === "notRunning" || state === "notInstalled"
    ? state
    : "notInstalled";
};

/** Reading anything is the only way to learn the Automation permission; macOS asks on the first try. */
const status = async (): Promise<Status> => {
  const state = await probe();
  if (state !== "running") return state;
  try {
    await runScript(COUNT_SCRIPT);
    return "granted";
  } catch (error) {
    if (error instanceof ScriptFailure && error.failure.code === "notRunning") return "notRunning";
    return "denied";
  }
};

/** Profile names as Dia shows them; its scripting interface reports them lowercased. */
const displayNames = (): Map<string, string> => {
  const names = new Map<string, string>();
  try {
    const localState = `${NodeOs.homedir()}/Library/Application Support/Dia/User Data/Local State`;
    const parsed = JSON.parse(NodeFs.readFileSync(localState, "utf8")) as {
      profile?: { info_cache?: Record<string, { name?: unknown }> };
    };
    for (const entry of Object.values(parsed.profile?.info_cache ?? {})) {
      if (typeof entry.name === "string")
        names.set(entry.name.trim().toLowerCase(), entry.name.trim());
    }
  } catch {
    // Names stay as the scripting interface reports them.
  }
  return names;
};

const isWebUrl = (url: string) => /^https?:\/\/[^/?#]+/i.test(url);

const dedupeKey = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return parsed.host ? parsed.href.replace(/#$/, "") : null;
  } catch {
    return null;
  }
};

/** Same grouping and de-duplication as native Ardia's DiaTabsImport.build. */
const build = (windows: ScriptWindow[]) => {
  const names = displayNames();
  const order: string[] = [];
  const profiles = new Map<
    string,
    {
      name: string;
      index: number;
      pinned: ImportedTab[];
      tabs: ImportedTab[];
      pinnedKeys: Set<string>;
      tabKeys: Map<string, ImportedTab>;
    }
  >();
  let skipped = 0;
  let duplicates = 0;

  [...windows]
    .sort((a, b) => a.index - b.index)
    .forEach((window, windowIndex) => {
      for (const profile of window.profiles) {
        const name = profile.name ?? "";
        const id = `${profile.index}:${name}`;
        let acc = profiles.get(id);
        if (!acc) {
          order.push(id);
          acc = {
            name,
            index: profile.index,
            pinned: [],
            tabs: [],
            pinnedKeys: new Set(),
            tabKeys: new Map(),
          };
          profiles.set(id, acc);
        }
        for (const tab of profile.tabs) {
          const url = (tab.url ?? "").trim();
          const key = isWebUrl(url) ? dedupeKey(url) : null;
          if (!key) {
            skipped += 1;
            continue;
          }
          const imported: ImportedTab = {
            url,
            title: tab.title ?? "",
            pinned: tab.pinned,
            windowIndex,
            active: tab.focused,
          };
          if (tab.pinned) {
            if (acc.pinnedKeys.has(key)) {
              duplicates += 1;
              continue;
            }
            acc.pinnedKeys.add(key);
            acc.pinned.push(imported);
            const open = acc.tabKeys.get(key);
            if (open) {
              acc.tabKeys.delete(key);
              acc.tabs = acc.tabs.filter((t) => t !== open);
              duplicates += 1;
            }
          } else {
            if (acc.pinnedKeys.has(key) || acc.tabKeys.has(key)) {
              duplicates += 1;
              continue;
            }
            acc.tabKeys.set(key, imported);
            acc.tabs.push(imported);
          }
        }
      }
    });

  const result: DiaTabsProfile[] = order.flatMap((id) => {
    const p = profiles.get(id)!;
    if (!p.pinned.length && !p.tabs.length) return [];
    const name = names.get(p.name.trim().toLowerCase()) ?? (p.name || `Profile ${p.index}`);
    return [{ id, name, index: p.index, pinned: p.pinned, tabs: p.tabs }];
  });
  return {
    profiles: result.sort((a, b) => a.index - b.index),
    windowCount: windows.length,
    skipped,
    duplicates,
  };
};

const read = async () => {
  if ((await probe()) !== "running")
    throw new ScriptFailure({ code: "notRunning", message: "Dia isn't running" });
  return build(JSON.parse(await runScript(READ_SCRIPT)) as ScriptWindow[]);
};

const openDia = () =>
  new Promise<null>((resolve, reject) =>
    NodeChildProcess.execFile("/usr/bin/open", ["-b", DIA_BUNDLE_ID], (error) =>
      error
        ? reject(new ScriptFailure({ code: "notFound", message: "Dia isn't installed" }))
        : resolve(null),
    ),
  );

const OPERATIONS: Record<string, () => Promise<unknown>> = {
  status,
  read,
  open: openDia,
  openAutomationSettings: () =>
    Electron.shell
      .openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")
      .then(() => null),
};

let installed = false;

export const installDiaImportIpc = (): void => {
  if (installed || process.platform !== "darwin") return;
  installed = true;
  Electron.ipcMain.handle(ARDIA_DIA_CHANNEL, async (event, operation: unknown): Promise<Reply> => {
    // Web pages in the browser are `webview` guests; only the app window may read Dia.
    const run = typeof operation === "string" ? OPERATIONS[operation] : undefined;
    if (event.sender.getType() !== "window" || !run) {
      return { ok: false, code: "unreadable", message: "Not available" };
    }
    try {
      return { ok: true, value: await run() };
    } catch (error) {
      if (error instanceof ScriptFailure) return { ok: false, ...error.failure };
      return { ok: false, code: "unreadable", message: "Dia couldn't list its tabs" };
    }
  });
};
