import { useAutoAnimate } from "@formkit/auto-animate/react";
import type { RomeSpace, RomeTab } from "@t3-ardia/entry";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { AppWindowIcon, BotIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { ardiaAvailable, useArdiaHostStore } from "../../../browser/ardia/ardiaHostStore";
import { useAgentDriving } from "../../../browser/rome/agentActivityStore";
import {
  browser,
  startBrowserModel,
  switchSpaceAnimated,
  useBrowserModel,
  useCurrentSpace,
} from "../../../browser/rome/browserStore";
import {
  filedItems,
  folderItem,
  parseFolderItem,
  useFolderStore,
} from "../../../browser/rome/folderStore";
import { useShowTab } from "../../../browser/rome/useShowTab";
import { Kbd } from "../../ui/kbd";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuItem,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../../ui/menu";
import { editSpace, newSpace } from "./SpaceDialog";
import { BrowserTabRow, showTabMenu, SiteIcon } from "./BrowserTabRow";
import { startFolderDrag, useFolderDrag } from "./folderDrag";
import { createFolder } from "./folderMenus";
import { SidebarAddress } from "./SidebarAddress";

const NO_TABS: readonly RomeTab[] = [];
const NO_WINDOWS: Readonly<Record<string, string>> = {};
// Pinned tiles fill the sidebar's width, as many to a row as fit at their
// smallest, for at most two rows; pinned tabs past that list as rows below.
const TILE_MIN_WIDTH = 40;
const TILE_GAP = 6;
const TILE_ROWS = 2;

/** A space's mark: its colour with its first letter. */
export function SpaceMark({ space, className }: { space: RomeSpace; className?: string }) {
  if (space.icon) {
    return (
      <span
        aria-hidden
        style={{ background: `color-mix(in oklab, ${space.accent} 24%, transparent)` }}
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-[6px] text-[11px] leading-none",
          className,
        )}
      >
        {space.icon}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      style={{ background: space.accent }}
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-[6px] font-semibold text-[10px] text-white uppercase",
        className,
      )}
    >
      {space.name.trim().charAt(0) || "·"}
    </span>
  );
}

const EXTENSIONS_STORE = "https://chromewebstore.google.com/category/extensions";

function SpaceSwitcher() {
  const navigate = useNavigate();
  const spaces = useBrowserModel((state) => state.browser?.spaces ?? null);
  const elsewhere = useBrowserModel((state) => state.browser?.elsewhere ?? NO_WINDOWS);
  const movable = useBrowserModel(useShallow((state) => state.browser?.newWindowSpaces ?? []));
  const space = useCurrentSpace();
  if (!spaces || !space) return <div className="h-8" />;
  return (
    <Menu>
      <MenuTrigger
        className="flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-sidebar-foreground outline-hidden hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Space: ${space.name}`}
      >
        <SpaceMark space={space} />
        <span className="min-w-0 truncate font-semibold text-sm tracking-tight">{space.name}</span>
        <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
      </MenuTrigger>
      <MenuPopup align="start" className="min-w-52">
        <MenuGroup>
          <MenuGroupLabel>Spaces</MenuGroupLabel>
          <MenuRadioGroup
            value={space.id}
            onValueChange={(value) => {
              if (typeof value === "string") switchSpaceAnimated(value);
            }}
          >
            {spaces.map((option) => (
              <MenuRadioItem key={option.id} value={option.id}>
                <span className="flex w-full min-w-0 items-center gap-2">
                  <SpaceMark space={option} className="size-4 rounded-[5px] text-[9px]" />
                  <span className="truncate">{option.name}</span>
                  {elsewhere[option.id] ? (
                    <AppWindowIcon
                      aria-label="Open in another window"
                      className="ml-auto size-3.5 shrink-0 text-muted-foreground"
                    />
                  ) : null}
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        {movable.length ? (
          <MenuSub>
            <MenuSubTrigger>Open in new window</MenuSubTrigger>
            <MenuSubPopup>
              {spaces
                .filter((option) => movable.includes(option.id))
                .map((option) => (
                  <MenuItem
                    key={option.id}
                    onClick={() => browser()?.openSpaceInNewWindow(option.id)}
                  >
                    <SpaceMark space={option} className="size-4 rounded-[5px] text-[9px]" />
                    <span className="truncate">{option.name}</span>
                  </MenuItem>
                ))}
            </MenuSubPopup>
          </MenuSub>
        ) : null}
        <MenuItem onClick={() => createFolder()}>New folder</MenuItem>
        <MenuItem
          onClick={() => {
            // Extensions install from the Chrome Web Store, into this space.
            browser()?.openTab(EXTENSIONS_STORE, { spaceId: space.id });
            void navigate({ to: "/browse" });
          }}
        >
          Get extensions…
        </MenuItem>
        <MenuItem onClick={() => editSpace(space.id)}>Customize {space.name}…</MenuItem>
        <MenuItem onClick={newSpace}>New space…</MenuItem>
      </MenuPopup>
    </Menu>
  );
}

function PinnedTile({
  tab,
  active,
  landing,
}: {
  tab: RomeTab;
  active: boolean;
  /** Where the tab being dragged would land. */
  landing: boolean;
}) {
  const showTab = useShowTab();
  const driving = useAgentDriving(tab.id);
  return (
    <button
      type="button"
      title={tab.title}
      aria-label={tab.title}
      aria-current={active ? "page" : undefined}
      data-pinned-tile={tab.id}
      onPointerDown={(event) => startFolderDrag(event, folderItem.tab(tab.id), tab.title)}
      onClick={() => showTab(tab)}
      onContextMenu={(event) => {
        event.preventDefault();
        void showTabMenu(tab, { x: event.clientX, y: event.clientY });
      }}
      className={cn(
        "relative grid aspect-square max-h-12 min-h-10 w-full cursor-pointer place-items-center rounded-xl outline-hidden transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        landing
          ? "bg-sidebar-foreground/[0.08] ring-(--space-accent,var(--foreground)) ring-1 ring-inset"
          : active
            ? "bg-sidebar-row-active"
            : "bg-sidebar-foreground/[0.045] hover:bg-sidebar-foreground/[0.08]",
      )}
    >
      <SiteIcon src={tab.favicon} className="size-[18px]" />
      {driving ? (
        <BotIcon
          aria-label="The agent is working in this tab"
          className="absolute top-1 right-1 size-3 animate-pulse text-sidebar-muted-foreground"
        />
      ) : null}
    </button>
  );
}

function PinnedTiles() {
  // Pinned tabs kept in folders show in their folder instead.
  const folders = useFolderStore((state) => state.folders);
  const pinned = useBrowserModel(
    useShallow((state) => {
      const model = state.browser;
      if (!model?.spaceId) return NO_TABS;
      const filed = filedItems(folders);
      return (model.order[model.spaceId] ?? []).flatMap((id) => {
        const tab = model.tabs[id];
        return tab?.pinned && !filed.has(folderItem.tab(id)) ? [tab] : [];
      });
    }),
  );
  const drag = useFolderDrag();
  const draggedId = drag?.item.startsWith("tab:") ? parseFolderItem(drag.item).id : null;
  const dragged = useBrowserModel((state) =>
    draggedId ? (state.browser?.tabs[draggedId] ?? null) : null,
  );
  const activeId = useBrowserModel((state) =>
    state.browser?.spaceId ? (state.browser.active[state.browser.spaceId] ?? null) : null,
  );
  const onBrowse = useLocation({ select: (location) => location.pathname === "/browse" });
  const [grid, setAnimating] = useAutoAnimate<HTMLDivElement>({ duration: 150 });
  // The tiles only animate to make room for a tab being dragged in; left on, every
  // other change (a space change most of all) pays to measure each tile.
  const dragging = drag?.drop?.kind === "tiles";
  useEffect(() => setAnimating(dragging), [dragging, setAnimating]);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!box) return;
    return observeResize(box, (entries) => {
      const last = entries.at(-1);
      if (last) setWidth(last.contentRect.width);
    });
  }, [box]);
  if (!pinned.length && !dragged) return null;
  // While a tab is dragged over the tiles, they make room for it where it would land.
  const drop = drag?.drop?.kind === "tiles" ? drag.drop : null;
  let tiles = pinned;
  if (drop && dragged) {
    tiles = pinned.filter((tab) => tab.id !== dragged.id);
    const at = drop.before ? tiles.findIndex((tab) => tab.id === drop.before) : -1;
    tiles = tiles.toSpliced(at < 0 ? tiles.length : at, 0, dragged);
  }
  const perRow = Math.max(1, Math.floor((width + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP)));
  const shown = width ? tiles.slice(0, perRow * TILE_ROWS) : tiles;
  const listed = tiles.slice(shown.length);
  // Rows split evenly, so six tiles that fit five to a row sit three and three.
  const columns = width ? Math.ceil(shown.length / Math.ceil(shown.length / perRow)) : 0;
  return (
    <div
      ref={setBox}
      data-folder-drop-tiles=""
      className={cn(
        "flex flex-col gap-1.5 px-0.5 pt-2",
        !tiles.length && "min-h-12 rounded-xl border border-sidebar-foreground/15 border-dashed",
      )}
    >
      {shown.length ? (
        <div
          ref={grid}
          style={
            columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined
          }
          className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5"
        >
          {shown.map((tab) => (
            <PinnedTile
              key={tab.id}
              tab={tab}
              active={onBrowse && tab.id === activeId}
              landing={drop !== null && tab.id === draggedId}
            />
          ))}
        </div>
      ) : null}
      {listed.length ? (
        <div className="flex flex-col gap-px">
          {listed.map((tab) => (
            <div key={tab.id} data-pinned-tile={tab.id}>
              <BrowserTabRow tab={tab} active={onBrowse && tab.id === activeId} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The top of the sidebar: the space, the one way to start something new, and the
 * space's pinned tabs.
 */
export function RomeSidebarTop(props: {
  readonly onNew: () => void;
  readonly newShortcutLabel: string | null;
}) {
  // The browser loads with the sidebar: its tabs are part of the list.
  const request = useArdiaHostStore((state) => state.request);
  useEffect(() => {
    if (!ardiaAvailable) return;
    request();
    startBrowserModel();
  }, [request]);
  return (
    // All of it (the space's name, address, New, apps and pinned tabs) slides with
    // the list below as one piece when the space changes.
    <div data-space-slide="" className="flex shrink-0 flex-col gap-2 px-2.5 pb-1">
      <SpaceSwitcher />
      <SidebarAddress />
      <button
        type="button"
        onClick={props.onNew}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-sidebar-foreground/[0.06] px-2.5 font-medium text-sidebar-foreground text-sm outline-hidden transition-colors hover:bg-sidebar-foreground/[0.1] focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlusIcon aria-hidden className="size-4 text-(--space-accent)" />
        New
        {props.newShortcutLabel ? (
          <Kbd className="font-label ml-auto bg-transparent text-[11px] text-sidebar-muted-foreground">
            {props.newShortcutLabel}
          </Kbd>
        ) : null}
      </button>
      <PinnedTiles />
    </div>
  );
}
