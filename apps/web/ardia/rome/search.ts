import { buildSuggestions, createSuggestFetcher, resolveInput, type Suggestion } from "@ardia/core";
import { useBrowser } from "@ardia-app/store/browser";

import { defaultSearchEngine } from "@ardia-app/store/settings";
import { desktop } from "../bridge";
import { knownFavicon } from "../shims/web/webviewPool";
import { pageTitle } from "./model";

// The address field's suggestions for T3 Code's own Search field: open tabs, pages
// visited before, and the search engine's suggestions.

export type { Suggestion };

type Visit = {
  url: string;
  title: string;
  favicon: string | null;
  visits: number;
  lastVisit: number;
  spaceId: string;
};

const HISTORY_KEY = "rome:history:v1";
const HISTORY_LIMIT = 3000;

let history: Visit[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as Visit[];
  } catch {
    return [];
  }
})();

let saveTimer = 0;
const save = () => {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(
    () => localStorage.setItem(HISTORY_KEY, JSON.stringify(history)),
    1000,
  );
};

const isPage = (url: string) => /^https?:\/\//i.test(url);

function noteVisit(url: string, title: string, favicon: string | null, spaceId: string) {
  const found = history.find((visit) => visit.url === url && visit.spaceId === spaceId);
  if (found) {
    found.visits += 1;
    found.lastVisit = Date.now();
    if (title) found.title = title;
    if (favicon) found.favicon = favicon;
  } else {
    history.push({ url, title, favicon, visits: 1, lastVisit: Date.now(), spaceId });
    if (history.length > HISTORY_LIMIT) {
      history.sort((a, b) => b.lastVisit - a.lastVisit);
      history = history.slice(0, HISTORY_LIMIT);
    }
  }
  save();
}

let recording = false;
function record() {
  if (recording) return;
  recording = true;
  useBrowser.subscribe((s, prev) => {
    if (s.tabs === prev.tabs) return;
    for (const tab of Object.values(s.tabs)) {
      const before = prev.tabs[tab.id];
      if (!isPage(tab.url)) continue;
      if (before?.url === tab.url && before.title === tab.title) continue;
      // A title landing after the URL updates the visit rather than counting twice.
      if (before?.url === tab.url) {
        const visit = history.find(
          (entry) => entry.url === tab.url && entry.spaceId === tab.profileId,
        );
        if (visit && tab.title) {
          visit.title = pageTitle(tab);
          save();
        }
        continue;
      }
      noteVisit(tab.url, pageTitle(tab), tab.favicon ?? knownFavicon(tab.url), tab.profileId);
    }
  });
}

const fetcher = createSuggestFetcher({
  fetch: async (url) => {
    if (!desktop?.suggest) return { ok: false, text: async () => "" };
    const reply = await desktop.suggest(url);
    return { ok: reply.ok, text: async () => reply.text };
  },
});

function sourceFor(spaceId: string) {
  const s = useBrowser.getState();
  const tabs = Object.values(s.tabs)
    .filter((tab) => tab.profileId === spaceId && isPage(tab.url))
    .map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: pageTitle(tab),
      favicon: tab.favicon ?? knownFavicon(tab.url),
    }));
  return { tabs, history: history.filter((visit) => visit.spaceId === spaceId) };
}

const currentSpace = () => {
  const s = useBrowser.getState();
  const windowId = s.ui.focusedWindowId ?? s.windowOrder[0];
  return (windowId && s.windows[windowId]?.profileId) || s.profileOrder[0] || "";
};

/**
 * Suggestions for `text` in the current space: `onResult` hears the local ones at
 * once and again when the search engine answers. Returns a cancel function.
 */
export function suggest(
  text: string,
  onResult: (items: Suggestion[], completion: string) => void,
): () => void {
  record();
  const s = useBrowser.getState();
  const engine = defaultSearchEngine(s.settings);
  const spaceId = currentSpace();
  const build = (remote: readonly string[]) => {
    const result = buildSuggestions(text, sourceFor(spaceId), {
      engine,
      preference: s.settings.commandBarPreference,
      remote,
      limit: 7,
    });
    onResult(result.items, result.completion);
  };
  build([]);
  const query = text.trim();
  if (!query || !s.settings.searchSuggestions || /^[a-z][a-z0-9+.-]*:\/\//i.test(query)) {
    fetcher.cancel();
    return () => {};
  }
  fetcher.request(engine, query, build);
  return () => fetcher.cancel();
}

/** What pressing Enter on `text` opens: the address it names, or a search for it. */
export function addressFor(text: string): string {
  return resolveInput(text, defaultSearchEngine(useBrowser.getState().settings).url);
}

/** The search engine's name, for the field's hint. */
export function searchEngineName(): string {
  return defaultSearchEngine(useBrowser.getState().settings).name;
}

/** Starts keeping the pages the user visits, for suggestions. */
export function startHistory() {
  record();
}
