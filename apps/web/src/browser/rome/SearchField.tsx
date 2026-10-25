import type { Suggestion } from "@t3-ardia/entry";
import { useNavigate } from "@tanstack/react-router";
import { CalculatorIcon, FolderIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { cn } from "~/lib/utils";
import { SiteIcon } from "../../components/sidebar/rome/BrowserTabRow";
import { useNewScreenStore } from "../../newScreenStore";
import { browser, useBrowserModel } from "./browserStore";
import { fileItem } from "./folderActions";
import { folderItem, useFolderStore } from "./folderStore";
import { useShowTab } from "./useShowTab";

type Row = Exclude<Suggestion, { kind: "action" } | { kind: "create" }>;

const isRow = (item: Suggestion): item is Row => item.kind !== "action" && item.kind !== "create";

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function RowTag({ row }: { row: Row }) {
  const label =
    row.kind === "page"
      ? row.tabId
        ? "Switch to tab"
        : row.visited
          ? "History"
          : "Open"
      : row.kind === "search"
        ? row.engine
        : "Copy";
  return (
    <span className="ml-auto shrink-0 pl-3 font-label text-[10.5px] text-muted-foreground/70 uppercase tracking-[0.06em]">
      {label}
    </span>
  );
}

/**
 * Search the web or jump to a page. On the New screen (no `owner`) the page opens
 * on the browser page; inside a browser surface it opens there, for that surface's
 * thread. `onAskChat` turns the text into a new chat instead (Cmd+Enter).
 */
export function SearchField(props: {
  readonly owner?: string | null;
  readonly autoFocus?: boolean;
  readonly onAskChat?: (text: string) => void;
}) {
  const navigate = useNavigate();
  const showTab = useShowTab();
  const ready = useBrowserModel((state) => state.browser !== null);
  const input = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState(0);
  const inSurface = props.owner !== undefined;
  // On the New screen the text lives in its store, so it survives switching to Chat.
  const [ownText, setOwnText] = useState("");
  const sharedText = useNewScreenStore((state) => state.searchText);
  const text = inSurface ? ownText : sharedText;
  const setText = (next: string) =>
    inSurface ? setOwnText(next) : useNewScreenStore.getState().setSearchText(next);
  const targetFolderId = useNewScreenStore((state) => (inSurface ? null : state.folderId));
  const targetFolder = useFolderStore((state) =>
    targetFolderId ? (state.folders[targetFolderId] ?? null) : null,
  );

  useEffect(() => {
    const actions = browser();
    if (!actions || !text.trim()) {
      setRows([]);
      return;
    }
    return actions.suggest(text, (items) => {
      setRows(items.filter(isRow));
      setSelected(0);
    });
  }, [text, ready]);

  useEffect(() => {
    if (props.autoFocus) input.current?.focus();
  }, [props.autoFocus]);

  const openUrl = (url: string) => {
    const tabId = browser()?.openTab(url, { owner: props.owner ?? null });
    // A page started from a folder's "New tab" goes into that folder.
    const folderId = inSurface ? null : useNewScreenStore.getState().folderId;
    const spaceId = useFolderStore.getState().folders[folderId ?? ""]?.spaceId;
    if (tabId && folderId && spaceId) {
      fileItem(folderItem.tab(tabId), { spaceId, folderId });
      useNewScreenStore.getState().setMode("browse");
    }
    setText("");
    if (!inSurface) void navigate({ to: "/browse" });
  };

  const choose = (row: Row | undefined) => {
    const actions = browser();
    if (!actions) return;
    if (!row) {
      if (text.trim()) openUrl(actions.addressFor(text));
      return;
    }
    if (row.kind === "calc") {
      void navigator.clipboard.writeText(row.value);
      return;
    }
    if (row.kind === "page" && row.tabId) {
      const tab = useBrowserModel.getState().browser?.tabs[row.tabId];
      if (tab) {
        setText("");
        showTab(tab);
        return;
      }
    }
    openUrl(row.url);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!rows.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSelected((current) => (current + step + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if ((event.metaKey || event.ctrlKey) && props.onAskChat) {
        if (text.trim()) props.onAskChat(text.trim());
        return;
      }
      choose(rows[selected]);
    } else if (event.key === "Escape" && text) {
      event.preventDefault();
      setText("");
    }
  };

  return (
    // The field keeps its height; suggestions open over whatever is below it.
    <div className="relative h-13">
      <div className="absolute inset-x-0 top-0 z-20 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xs/5">
        <label className="flex h-13 items-center gap-3 px-4">
          <SearchIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={input}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or enter an address"
            aria-label="Search or enter an address"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base outline-hidden placeholder:text-muted-foreground/70"
          />
          {targetFolder ? (
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-accent/60 py-0.5 pr-0.5 pl-1.5 text-muted-foreground text-xs">
              {targetFolder.icon ?? <FolderIcon aria-hidden className="size-3" />}
              <span className="max-w-32 truncate">{targetFolder.name}</span>
              <button
                type="button"
                aria-label={`Don't open in ${targetFolder.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  useNewScreenStore.getState().setMode("browse");
                }}
                className="grid size-4 cursor-pointer place-items-center rounded hover:bg-accent hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ) : null}
          {props.onAskChat && text.trim() ? (
            <span className="shrink-0 font-label text-[10.5px] text-muted-foreground/70 uppercase tracking-[0.06em]">
              ⌘↵ ask a chat
            </span>
          ) : null}
        </label>
        {rows.length ? (
          <ul
            role="listbox"
            aria-label="Suggestions"
            className="flex flex-col gap-px border-border border-t p-1.5"
          >
            {rows.map((row, index) => (
              <li
                key={`${row.kind}:${row.url}`}
                role="option"
                aria-selected={index === selected}
                onMouseEnter={() => setSelected(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(row)}
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm",
                  index === selected && "bg-accent/60",
                )}
              >
                {row.kind === "page" ? (
                  <SiteIcon src={row.favicon} className="size-4 shrink-0" />
                ) : row.kind === "calc" ? (
                  <CalculatorIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <SearchIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 truncate">
                  {row.kind === "page"
                    ? row.title || hostOf(row.url)
                    : row.kind === "search"
                      ? row.query
                      : `${row.expression} = ${row.value}`}
                </span>
                {row.kind === "page" ? (
                  <span className="min-w-0 shrink truncate text-muted-foreground/70 text-xs">
                    {hostOf(row.url)}
                  </span>
                ) : null}
                <RowTag row={row} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
