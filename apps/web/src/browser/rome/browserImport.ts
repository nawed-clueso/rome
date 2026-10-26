import { loadArdia } from "../ardia/ardiaHostStore";
import { browser, useBrowserModel } from "./browserStore";
import { fileItem } from "./folderActions";
import { folderItem, useFolderStore } from "./folderStore";

// Bringing a new user's browsing over from the browser they used before: Arc's
// spaces, pinned folders and favourites, Dia's pinned tabs, a Chromium browser's
// bookmarks bar, and the pages each has visited (for address suggestions). The
// desktop app reads the other browser (apps/desktop/src/ardia/BrowserMigration.ts).

export type ImportBrowser = {
  readonly id: string;
  readonly name: string;
  readonly kind: "arc" | "dia" | "chromium";
  readonly icon: string | null;
  readonly profiles: readonly { readonly id: string; readonly name: string }[];
};

type Link = { readonly url: string; readonly title: string };
type Pinned = { readonly title: string; readonly url?: string; readonly children?: Pinned[] };
type Visit = { url: string; title: string; visits: number; lastVisit: number };

export type ImportPlan = {
  readonly spaces: readonly { readonly name: string; readonly pinned: readonly Pinned[] }[];
  readonly favorites: readonly Link[];
  readonly history: readonly Visit[];
};

export type ImportChoices = { readonly tabs: boolean; readonly history: boolean };
export type ImportSummary = { spaces: number; tabs: number; pages: number };

type MigrateBridge = {
  migrate?(operation: "list" | "read", browserId?: string, profileId?: string): Promise<unknown>;
  dia?(operation: "read"): Promise<{ ok: true; value: unknown } | { ok: false; message: string }>;
};
const desktop = (globalThis as { ardiaDesktop?: MigrateBridge }).ardiaDesktop ?? null;

/** Whether this build can import at all (the macOS desktop app). */
export const canImportBrowsers = typeof desktop?.migrate === "function";

export async function listImportBrowsers(): Promise<ImportBrowser[]> {
  const browsers = (await desktop?.migrate?.("list")) as ImportBrowser[] | null | undefined;
  return browsers ?? [];
}

type DiaProfile = { name: string; pinned: { url: string; title: string }[] };

/** Dia's pinned tabs, read from Dia itself (it must be open, and asks for permission once). */
async function diaSpaces(profileName: string): Promise<ImportPlan["spaces"]> {
  const reply = await desktop?.dia?.("read");
  if (!reply) return [];
  if (!reply.ok) throw new Error(reply.message);
  const profiles = (reply.value as { profiles?: DiaProfile[] } | null)?.profiles ?? [];
  const matching = profiles.filter((profile) => profile.name === profileName);
  return (matching.length ? matching : profiles).map((profile) => ({
    name: profile.name,
    pinned: profile.pinned.map((tab) => ({ title: tab.title, url: tab.url })),
  }));
}

/** What the browser's profile holds, ready to show and import. */
export async function readImport(source: ImportBrowser, profileId: string): Promise<ImportPlan> {
  const read = (await desktop?.migrate?.("read", source.id, profileId)) as ImportPlan | null;
  const plan = read ?? { spaces: [], favorites: [], history: [] };
  if (source.kind !== "dia") return plan;
  const profileName = source.profiles.find((profile) => profile.id === profileId)?.name ?? "";
  return { ...plan, spaces: await diaSpaces(profileName) };
}

const countTabs = (nodes: readonly Pinned[]): number =>
  nodes.reduce((sum, node) => sum + (node.url ? 1 : countTabs(node.children ?? [])), 0);

/** How many tabs the plan would add. */
export const planTabCount = (plan: ImportPlan) =>
  plan.favorites.length + plan.spaces.reduce((sum, space) => sum + countTabs(space.pinned), 0);

/**
 * Adds the plan to Rome: each space becomes a space (joining one of the same
 * name), its pinned folders become folders and its loose pinned tabs pinned
 * tiles, and favourites become tiles in the first space. Pages already open in a
 * space aren't added twice. The space you were in stays in view.
 */
export async function applyImport(
  plan: ImportPlan,
  choices: ImportChoices,
): Promise<ImportSummary> {
  const actions = browser() ?? (await loadArdia());
  const summary: ImportSummary = { spaces: 0, tabs: 0, pages: 0 };
  const startModel = useBrowserModel.getState().browser;
  const startSpace = startModel?.spaceId ?? null;

  const spaceNamed = (name: string): string => {
    const model = useBrowserModel.getState().browser;
    const existing = model?.spaces.find(
      (space) => space.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (existing) return existing.id;
    summary.spaces += 1;
    return actions.createSpace({ name });
  };
  const openIn = (spaceId: string, link: { url?: string }): string | null => {
    if (!link.url) return null;
    const model = useBrowserModel.getState().browser;
    const open = Object.values(model?.tabs ?? {}).some(
      (tab) => tab.spaceId === spaceId && tab.url === link.url,
    );
    if (open) return null;
    const id = actions.openTab(link.url, { spaceId, background: true });
    if (id) {
      actions.setPinned(id, true);
      summary.tabs += 1;
    }
    return id;
  };
  const addFolder = (spaceId: string, node: Pinned, parentId: string | null) => {
    const folderId = useFolderStore.getState().create(spaceId, { parentId, name: node.title });
    for (const child of node.children ?? []) {
      if (child.children) addFolder(spaceId, child, folderId);
      else {
        const tabId = openIn(spaceId, child);
        if (tabId) fileItem(folderItem.tab(tabId), { spaceId, folderId });
      }
    }
  };

  let firstSpace = startSpace;
  if (choices.tabs) {
    plan.spaces.forEach((space, index) => {
      const spaceId = spaceNamed(space.name);
      if (index === 0) firstSpace = spaceId;
      for (const node of space.pinned) {
        if (node.children) addFolder(spaceId, node, null);
        else openIn(spaceId, node);
      }
    });
    if (firstSpace) for (const link of plan.favorites) openIn(firstSpace, link);
  }
  if (choices.history && plan.history.length) {
    // The pages land in every space the import touched, so each suggests them.
    const spaces = new Set([firstSpace, startSpace].filter((id): id is string => !!id));
    for (const spaceId of spaces) summary.pages = actions.importVisits(plan.history, spaceId);
  }
  if (startSpace) actions.switchSpace(startSpace);
  return summary;
}
