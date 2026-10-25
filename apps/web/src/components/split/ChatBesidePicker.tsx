import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { MessageSquareIcon, SearchIcon } from "lucide-react";
import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { create } from "zustand";

import { cn } from "~/lib/utils";
import { useSpaceThreads } from "../../browser/rome/useSpaceThreads";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { splitGroupOf, splitMembers, useSplitViewStore } from "../../splitViewStore";
import { useQuietThreadShells } from "../../state/entities";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";

const useChatPicker = create<{ open: boolean }>()(() => ({ open: false }));

/** Asks which chat to open beside the current one. */
export function openChatBeside() {
  useChatPicker.setState({ open: true });
}

const LIMIT = 12;

/** A quick list of the space's chats; the one picked opens as another pane. */
export function ChatBesidePicker() {
  const open = useChatPicker((state) => state.open);
  const routeTarget = useThreadRouteTarget();
  const exclude = routeTarget?.kind === "server" ? scopedThreadKey(routeTarget.threadRef) : null;

  const join = useSplitViewStore((state) => state.join);
  const group = useSplitViewStore((state) => splitGroupOf(state.groups, exclude));
  const threads = useSpaceThreads(useQuietThreadShells());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const needle = query.trim().toLowerCase();
  const rows = threads
    .map((thread) => ({
      thread,
      key: scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    }))
    .filter(
      ({ key, thread }) =>
        key !== exclude &&
        !(group && splitMembers(group).includes(key)) &&
        thread.title.toLowerCase().includes(needle),
    )
    .toSorted((a, b) => b.thread.updatedAt.localeCompare(a.thread.updatedAt))
    .slice(0, LIMIT);

  const close = () => {
    useChatPicker.setState({ open: false });
    setQuery("");
    setSelected(0);
  };
  const choose = (key: string | undefined) => {
    if (!key || !exclude) return;
    join(exclude, key);
    close();
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
      choose(rows[Math.min(selected, rows.length - 1)]?.key);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogPopup className="max-w-lg overflow-hidden p-0">
        <DialogTitle className="sr-only">Open a chat beside this one</DialogTitle>
        <label className="flex h-12 items-center gap-3 border-border border-b px-4">
          <SearchIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Open a chat beside this one"
            aria-label="Find a chat"
            className="min-w-0 flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground/70"
          />
        </label>
        <ul
          role="listbox"
          aria-label="Chats"
          className="flex max-h-80 flex-col gap-px overflow-y-auto p-1.5"
        >
          {rows.length === 0 ? (
            <li className="px-3 py-6 text-center text-muted-foreground text-sm">
              No other chats here
            </li>
          ) : (
            rows.map(({ thread, key }, index) => (
              <li
                key={key}
                role="option"
                aria-selected={index === selected}
                onMouseEnter={() => setSelected(index)}
                onClick={() => choose(key)}
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm",
                  index === selected && "bg-accent/60",
                )}
              >
                <MessageSquareIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{thread.title || "Untitled"}</span>
              </li>
            ))
          )}
        </ul>
      </DialogPopup>
    </Dialog>
  );
}
