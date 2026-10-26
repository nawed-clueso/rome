// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- A plain IPC handler that reads other browsers' files outside any Effect runtime, like DiaImport.
/**
 * Reads what a new user brings from the browser they used before, for Rome's
 * onboarding: Arc's spaces, pinned tabs and favourites, a Chromium browser's
 * bookmarks bar, and the pages each has visited (for address suggestions).
 * Read only, from copies where the browser holds a file open, and only for the
 * app's own window. Dia's open and pinned tabs come through DiaImport instead.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import * as Electron from "electron";

import { ARDIA_MIGRATE_CHANNEL } from "./channels.ts";

type Kind = "arc" | "dia" | "chromium";
type Source = {
  readonly id: string;
  readonly name: string;
  readonly kind: Kind;
  readonly app: string;
  /** The browser's user-data directory, under Application Support. */
  readonly dataDir: string;
};

const SOURCES: readonly Source[] = [
  { id: "arc", name: "Arc", kind: "arc", app: "/Applications/Arc.app", dataDir: "Arc/User Data" },
  { id: "dia", name: "Dia", kind: "dia", app: "/Applications/Dia.app", dataDir: "Dia/User Data" },
  {
    id: "chrome",
    name: "Chrome",
    kind: "chromium",
    app: "/Applications/Google Chrome.app",
    dataDir: "Google/Chrome",
  },
  {
    id: "brave",
    name: "Brave",
    kind: "chromium",
    app: "/Applications/Brave Browser.app",
    dataDir: "BraveSoftware/Brave-Browser",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    kind: "chromium",
    app: "/Applications/Microsoft Edge.app",
    dataDir: "Microsoft Edge",
  },
  {
    id: "vivaldi",
    name: "Vivaldi",
    kind: "chromium",
    app: "/Applications/Vivaldi.app",
    dataDir: "Vivaldi",
  },
  {
    id: "comet",
    name: "Comet",
    kind: "chromium",
    app: "/Applications/Comet.app",
    dataDir: "Comet",
  },
  {
    id: "helium",
    name: "Helium",
    kind: "chromium",
    app: "/Applications/Helium.app",
    dataDir: "net.imput.helium",
  },
];

type Link = { url: string; title: string };
type Visit = { url: string; title: string; visits: number; lastVisit: number };
type Profile = { id: string; name: string };
/** A pinned tab, or a folder of them. */
type Pinned = { title: string; url?: string; children?: Pinned[] };
type Space = { name: string; pinned: Pinned[] };
type Browser = { id: string; name: string; kind: Kind; icon: string | null; profiles: Profile[] };
type Browsing = { spaces: Space[]; favorites: Link[]; history: Visit[] };

const MAX_FAVORITES = 24;
const MAX_PINNED_PER_SPACE = 40;
const MAX_HISTORY = 1500;

const supportDir = () => NodePath.join(NodeOS.homedir(), "Library", "Application Support");
const dataDirOf = (source: Source) => NodePath.join(supportDir(), source.dataDir);

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(NodeFS.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

const isPage = (url: unknown): url is string =>
  typeof url === "string" && /^https?:\/\//i.test(url);

/** The browser's profiles, from its Local State; Arc's own hidden profile left out. */
function profilesOf(source: Source): Profile[] {
  const state = readJson(NodePath.join(dataDirOf(source), "Local State")) as {
    profile?: { info_cache?: Record<string, { name?: string }> };
  } | null;
  const cache = state?.profile?.info_cache ?? {};
  const profiles = Object.entries(cache)
    .filter(([, info]) => !info.name?.startsWith("__"))
    .filter(([dir]) => NodeFS.existsSync(NodePath.join(dataDirOf(source), dir)))
    .map(([dir, info]) => ({ id: dir, name: info.name || dir }));
  if (profiles.length) return profiles;
  return NodeFS.existsSync(NodePath.join(dataDirOf(source), "Default"))
    ? [{ id: "Default", name: "Default" }]
    : [];
}

async function iconOf(app: string): Promise<string | null> {
  try {
    // Finder's own rendering of the app: getFileIcon gives a generic bundle icon.
    const image = await Electron.nativeImage.createThumbnailFromPath(app, {
      width: 64,
      height: 64,
    });
    return image.isEmpty() ? null : image.toDataURL();
  } catch {
    return null;
  }
}

async function listBrowsers(): Promise<Browser[]> {
  const found = SOURCES.filter((source) => NodeFS.existsSync(dataDirOf(source)));
  return Promise.all(
    found.map(async (source) => ({
      id: source.id,
      name: source.name,
      kind: source.kind,
      icon: NodeFS.existsSync(source.app) ? await iconOf(source.app) : null,
      profiles: profilesOf(source),
    })),
  ).then((browsers) => browsers.filter((browser) => browser.profiles.length > 0));
}

/** The direct links on the bookmarks bar, as favourites. */
function bookmarksBar(profileDir: string): Link[] {
  const bookmarks = readJson(NodePath.join(profileDir, "Bookmarks")) as {
    roots?: { bookmark_bar?: { children?: { type?: string; url?: string; name?: string }[] } };
  } | null;
  return (bookmarks?.roots?.bookmark_bar?.children ?? [])
    .filter((node) => node.type === "url" && isPage(node.url))
    .slice(0, MAX_FAVORITES)
    .map((node) => ({ url: node.url!, title: node.name ?? "" }));
}

// Chromium counts time from 1601.
const WEBKIT_EPOCH_OFFSET_MS = 11_644_473_600_000;

/** The pages visited most recently, from a copy of the History database (the browser keeps it locked). */
function historyOf(profileDir: string): Visit[] {
  const source = NodePath.join(profileDir, "History");
  if (!NodeFS.existsSync(source)) return [];
  const copy = NodePath.join(
    NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "rome-history-")),
    "History",
  );
  try {
    NodeFS.copyFileSync(source, copy);
    const db = new NodeSqlite.DatabaseSync(copy, { readOnly: true });
    try {
      const rows = db
        .prepare(
          // Microseconds overflow a JS number, so they become milliseconds in SQL.
          `SELECT url, title, visit_count AS visits, last_visit_time / 1000 AS last
           FROM urls WHERE hidden = 0 AND (url LIKE 'http://%' OR url LIKE 'https://%')
           ORDER BY last_visit_time DESC LIMIT ?`,
        )
        .all(MAX_HISTORY) as { url: string; title: string | null; visits: number; last: number }[];
      return rows.map((row) => ({
        url: row.url,
        title: row.title ?? "",
        visits: Math.max(1, Number(row.visits)),
        lastVisit: Math.round(Number(row.last) - WEBKIT_EPOCH_OFFSET_MS),
      }));
    } finally {
      db.close();
    }
  } catch {
    return [];
  } finally {
    NodeFS.rmSync(NodePath.dirname(copy), { recursive: true, force: true });
  }
}

type ArcItem = {
  id: string;
  title?: string | null;
  childrenIds?: string[];
  data?: { tab?: { savedURL?: string; savedTitle?: string } };
};
type ArcSpace = {
  id: string;
  title?: string;
  containerIDs?: unknown[];
  profile?: { default?: boolean; custom?: { _0?: { directoryBasename?: string } } };
};

const arcProfileDir = (profile: ArcSpace["profile"] | undefined): string =>
  profile?.custom?._0?.directoryBasename ?? "Default";

/** Arc's spaces for one profile, with their pinned tabs (folders flattened), and its favourites. */
function arcSidebar(profileId: string): { spaces: Space[]; favorites: Link[] } {
  const sidebar = readJson(NodePath.join(supportDir(), "Arc", "StorableSidebar.json")) as {
    sidebar?: { containers?: unknown[] };
  } | null;
  const container = (sidebar?.sidebar?.containers ?? []).find(
    (entry): entry is { items: unknown[]; spaces: unknown[]; topAppsContainerIDs?: unknown[] } =>
      typeof entry === "object" && entry !== null && "items" in entry && "spaces" in entry,
  );
  if (!container) return { spaces: [], favorites: [] };
  const items = new Map<string, ArcItem>();
  for (const item of container.items) {
    if (typeof item === "object" && item !== null && "id" in item) {
      items.set((item as ArcItem).id, item as ArcItem);
    }
  }
  const linksUnder = (rootId: string, limit: number): Link[] => {
    const links: Link[] = [];
    const visit = (id: string) => {
      const item = items.get(id);
      if (!item || links.length >= limit) return;
      const url = item.data?.tab?.savedURL;
      if (isPage(url)) {
        links.push({ url, title: item.title || item.data?.tab?.savedTitle || "" });
        return;
      }
      for (const child of item.childrenIds ?? []) visit(child);
    };
    visit(rootId);
    return links;
  };
  // The pinned section keeps its folders; empty ones are left out.
  const pinnedUnder = (rootId: string): Pinned[] => {
    let count = 0;
    const children = (id: string): Pinned[] =>
      (items.get(id)?.childrenIds ?? []).flatMap((childId): Pinned[] => {
        const item = items.get(childId);
        if (!item || count >= MAX_PINNED_PER_SPACE) return [];
        const url = item.data?.tab?.savedURL;
        if (isPage(url)) {
          count += 1;
          return [{ title: item.title || item.data?.tab?.savedTitle || "", url }];
        }
        const nested = children(childId);
        return nested.length ? [{ title: item.title?.trim() || "Folder", children: nested }] : [];
      });
    return children(rootId);
  };
  // Lists alternate a key ("pinned", or a profile) with the container's id.
  const after = (
    list: unknown[] | undefined,
    matches: (key: unknown) => boolean,
  ): string | null => {
    const entries = list ?? [];
    for (let index = 0; index < entries.length - 1; index += 2) {
      if (matches(entries[index]) && typeof entries[index + 1] === "string") {
        return entries[index + 1] as string;
      }
    }
    return null;
  };
  const spaces = container.spaces
    .filter((space): space is ArcSpace => typeof space === "object" && space !== null)
    .filter((space) => arcProfileDir(space.profile) === profileId)
    .map((space) => {
      const pinnedId = after(space.containerIDs, (key) => key === "pinned");
      return {
        name: space.title?.trim() || "Space",
        pinned: pinnedId ? pinnedUnder(pinnedId) : [],
      };
    });
  const favoritesId = after(
    container.topAppsContainerIDs,
    (key) => arcProfileDir(key as ArcSpace["profile"]) === profileId,
  );
  return { spaces, favorites: favoritesId ? linksUnder(favoritesId, MAX_FAVORITES) : [] };
}

function readBrowsing(browserId: unknown, profileId: unknown): Browsing | null {
  const source = SOURCES.find((entry) => entry.id === browserId);
  if (!source || typeof profileId !== "string") return null;
  // Only a profile the browser itself lists, so the id can't point elsewhere on disk.
  if (!profilesOf(source).some((profile) => profile.id === profileId)) return null;
  const profileDir = NodePath.join(dataDirOf(source), profileId);
  const history = historyOf(profileDir);
  if (source.kind === "arc") return { ...arcSidebar(profileId), history };
  return { spaces: [], favorites: bookmarksBar(profileDir), history };
}

let installed = false;

export const installBrowserMigrationIpc = (): void => {
  if (installed) return;
  installed = true;
  Electron.ipcMain.handle(
    ARDIA_MIGRATE_CHANNEL,
    async (event, operation: unknown, browserId: unknown, profileId: unknown) => {
      if (event.sender.getType() !== "window") return null;
      if (operation === "list") return listBrowsers();
      if (operation === "read") return readBrowsing(browserId, profileId);
      return null;
    },
  );
};
