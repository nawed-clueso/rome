import type { ClosedRomeTab, TopSite } from "@t3-ardia/entry";
import { useNavigate } from "@tanstack/react-router";
import { RotateCcwIcon } from "lucide-react";

import { SiteIcon } from "../../components/sidebar/rome/BrowserTabRow";
import { Kbd, KbdGroup } from "../../components/ui/kbd";
import { browser, useBrowserModel } from "./browserStore";
import { RecentTabs } from "./RecentTabs";

const TOP_SITES = 8;
const CLOSED = 5;

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";
const ALT = isMac ? "⌥" : "Alt";
const SHIFT = isMac ? "⇧" : "Shift";
const CTRL = isMac ? "⌃" : "Ctrl";

/** The browser's keys, Rome's own first. */
const SHORTCUTS: readonly { readonly keys: readonly string[][]; readonly label: string }[] = [
  { keys: [[MOD, "T"]], label: "New tab" },
  { keys: [[MOD, "L"]], label: "Edit the address" },
  { keys: [[ALT, MOD, "C"]], label: "Copy the page's link" },
  { keys: [[MOD, "W"]], label: "Close tab" },
  { keys: [[SHIFT, MOD, "T"]], label: "Reopen closed tab" },
  {
    keys: [
      [MOD, "["],
      [MOD, "]"],
    ],
    label: "Back, forward",
  },
  { keys: [[MOD, "R"]], label: "Reload" },
  { keys: [[MOD, "F"]], label: "Find in page" },
  { keys: [[MOD, "1–9"]], label: "Go to a tab" },
  { keys: [[CTRL, "Tab"]], label: "Switch tabs" },
  { keys: [[SHIFT, MOD, "A"]], label: "Search tabs" },
  { keys: [[MOD, "S"]], label: "Show or hide the sidebar" },
  {
    keys: [
      [MOD, "+"],
      [MOD, "−"],
    ],
    label: "Zoom (or pinch)",
  },
  { keys: [[MOD, "click"]], label: "Open a link in a new tab, in its folder" },
  { keys: [[MOD, "N"]], label: "New chat" },
];

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const ago = (at: number) => {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
};

/**
 * Reads `read` for the current space on each render: renders follow the space and
 * its tabs opening or closing, which is when these lists change.
 */
function useSpaceList<T>(read: (spaceId: string, tabCount: number) => T[]): T[] {
  const spaceId = useBrowserModel((state) => state.browser?.spaceId ?? null);
  const tabCount = useBrowserModel((state) => Object.keys(state.browser?.tabs ?? {}).length);
  return spaceId ? read(spaceId, tabCount) : [];
}

function QuickLinks() {
  const navigate = useNavigate();
  const sites = useSpaceList<TopSite>((spaceId) => browser()?.topSites(spaceId, TOP_SITES) ?? []);
  if (!sites.length) return null;
  const open = (url: string) => {
    const actions = browser();
    const model = useBrowserModel.getState().browser;
    if (!actions || !model?.spaceId) return;
    // A site already open in this space comes forward instead of opening twice.
    const open = Object.values(model.tabs).find(
      (tab) => tab.spaceId === model.spaceId && hostOf(tab.url) === hostOf(url),
    );
    if (open) actions.activateTab(open.id);
    else actions.openTab(url, { spaceId: model.spaceId });
    void navigate({ to: "/browse" });
  };
  return (
    <section aria-label="Most visited" className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {sites.map((site) => (
        <button
          key={site.url}
          type="button"
          aria-label={site.title || hostOf(site.url)}
          onClick={() => open(site.url)}
          className="group flex min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl px-1 py-2 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <span className="grid size-11 place-items-center rounded-xl border border-border bg-card transition-colors group-hover:border-foreground/20">
            <SiteIcon src={site.favicon} className="size-5" />
          </span>
          <span className="w-full truncate text-center text-muted-foreground text-xs group-hover:text-foreground">
            {hostOf(site.url)}
          </span>
        </button>
      ))}
    </section>
  );
}

function RecentlyClosed() {
  const closed = useSpaceList<ClosedRomeTab>(
    (spaceId) => browser()?.recentlyClosed(spaceId, CLOSED) ?? [],
  );
  return (
    <section aria-label="Recently closed" className="flex min-w-0 flex-col gap-2.5">
      <h2 className="px-1 font-label text-muted-foreground text-xs uppercase tracking-wide">
        Recently closed
      </h2>
      {closed.length ? (
        <div className="flex flex-col gap-px">
          {closed.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => browser()?.restoreClosedTab(entry.id)}
              className="group flex h-9 min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <SiteIcon src={entry.favicon} className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{entry.title}</span>
              <span className="shrink-0 text-muted-foreground text-xs group-hover:hidden">
                {ago(entry.closedAt)}
              </span>
              <RotateCcwIcon
                aria-label="Reopen"
                className="hidden size-3.5 shrink-0 text-muted-foreground group-hover:block"
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="px-1 text-muted-foreground text-sm">Tabs you close show up here.</p>
      )}
    </section>
  );
}

function Shortcuts() {
  return (
    <section aria-label="Shortcuts" className="flex min-w-0 flex-col gap-2.5">
      <h2 className="px-1 font-label text-muted-foreground text-xs uppercase tracking-wide">
        Shortcuts
      </h2>
      <dl className="flex flex-col gap-1.5 px-1">
        {SHORTCUTS.map((shortcut) => (
          <div
            key={shortcut.label}
            className="flex min-w-0 items-center justify-between gap-3 text-sm"
          >
            <dt className="min-w-0 truncate text-muted-foreground">{shortcut.label}</dt>
            <dd className="flex shrink-0 items-center gap-1">
              {shortcut.keys.map((chord) => (
                <KbdGroup key={chord.join("+")}>
                  {chord.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </KbdGroup>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Under the New screen's search: the space's most visited sites, its recent tabs,
 * what was closed lately, and the browser's keys.
 */
export function BrowseHome() {
  return (
    <div className="flex flex-col gap-8 pb-10">
      <QuickLinks />
      <RecentTabs />
      <div className="grid gap-8 sm:grid-cols-2">
        <RecentlyClosed />
        <Shortcuts />
      </div>
    </div>
  );
}
