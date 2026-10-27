import type { RomeTab } from "@t3-ardia/entry";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { SiteIcon } from "../../components/sidebar/rome/BrowserTabRow";
import { browser, useBrowserModel } from "./browserStore";
import { useShowTab } from "./useShowTab";

const COUNT = 3;
const NO_TABS: readonly RomeTab[] = [];
// Pictures are taken a moment after a page settles; look again now and then.
const REFRESH_MS = 2000;

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function TabCard(props: { readonly tab: RomeTab; readonly picture: string | null }) {
  const showTab = useShowTab();
  const { tab, picture } = props;
  return (
    <button
      type="button"
      onClick={() => showTab(tab)}
      className="group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-xs/5 outline-none transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="relative block aspect-[16/10] overflow-hidden bg-muted/40">
        {picture ? (
          <img
            src={picture}
            alt=""
            draggable={false}
            className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          // No picture until the tab has been shown since launch: its icon, large.
          <span className="grid size-full place-items-center">
            <SiteIcon src={tab.favicon} className="size-8 opacity-80" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-2 px-3 py-2">
        <SiteIcon src={tab.favicon} className="size-3.5 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-xs">{tab.title}</span>
          <span className="truncate text-muted-foreground text-xs">{hostOf(tab.url)}</span>
        </span>
      </span>
    </button>
  );
}

/** The space's most recently used tabs, as picture cards, under the New screen's search. */
export function RecentTabs() {
  const tabs = useBrowserModel(
    useShallow((state) => {
      const model = state.browser;
      if (!model?.spaceId) return NO_TABS;
      const recent = Object.values(model.tabs)
        .filter((tab) => tab.spaceId === model.spaceId && tab.url && !tab.url.startsWith("about:"))
        .toSorted((a, b) => b.lastActiveAt - a.lastActiveAt)
        .slice(0, COUNT);
      return recent.length ? recent : NO_TABS;
    }),
  );
  const [pictures, setPictures] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const read = () => {
      const actions = browser();
      if (!actions) return;
      setPictures((current) => {
        const next = Object.fromEntries(tabs.map((tab) => [tab.id, actions.tabPicture(tab.id)]));
        const same = tabs.every((tab) => current[tab.id] === next[tab.id]);
        return same ? current : next;
      });
    };
    read();
    const timer = setInterval(read, REFRESH_MS);
    return () => clearInterval(timer);
  }, [tabs]);

  if (!tabs.length) return null;
  return (
    <section aria-label="Recent tabs" className="flex flex-col gap-2.5">
      <h2 className="px-1 font-label text-muted-foreground text-xs uppercase tracking-wide">
        Recent tabs
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {tabs.map((tab) => (
          <TabCard key={tab.id} tab={tab} picture={pictures[tab.id] ?? null} />
        ))}
      </div>
    </section>
  );
}
