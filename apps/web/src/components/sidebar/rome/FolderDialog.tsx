import { useState } from "react";
import { create } from "zustand";

import { cn } from "~/lib/utils";
import { browser } from "../../../browser/rome/browserStore";
import { type RomeFolder, useFolderStore } from "../../../browser/rome/folderStore";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import { FolderMark } from "./SpaceFolders";

const EMOJI = [
  "📁",
  "⭐️",
  "💼",
  "🏠",
  "📚",
  "🧪",
  "🎨",
  "🛠️",
  "💡",
  "🚀",
  "🎧",
  "📈",
  "🐛",
  "🔥",
  "✅",
  "📌",
  "🧭",
  "📦",
  "💬",
  "🗂️",
  "🔒",
  "🌱",
  "🎯",
  "❤️",
];

const useFolderDialog = create<{ folderId: string | null }>()(() => ({ folderId: null }));

/** Opens the folder's name, emoji and colour for editing. */
export const customizeFolder = (folderId: string) => useFolderDialog.setState({ folderId });
const close = () => useFolderDialog.setState({ folderId: null });

function FolderForm(props: { readonly folder: RomeFolder }) {
  const colors = browser()?.SPACE_COLORS ?? [];
  const [name, setName] = useState(props.folder.name);
  const [icon, setIcon] = useState<string | null>(props.folder.icon);
  const [color, setColor] = useState<string | null>(props.folder.color ?? null);
  const preview: RomeFolder = { ...props.folder, icon, color };
  const save = () => {
    if (!name.trim()) return;
    useFolderStore.getState().customize(props.folder.id, { name, icon, color });
    close();
  };
  const swatchClass = (selected: boolean) =>
    cn(
      "size-7 cursor-pointer rounded-full ring-offset-2 ring-offset-popover transition-shadow",
      selected ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-foreground/30",
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Customize folder</DialogTitle>
        <DialogDescription>
          Its name, and the emoji and colour it shows in the sidebar.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent">
              <FolderMark folder={preview} open={false} className="size-6 text-2xl" />
            </span>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
              }}
              placeholder="Name"
              aria-label="Folder name"
              className="flex-1"
            />
          </div>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-label text-2xs text-muted-foreground uppercase tracking-wider">
                Icon
              </span>
              <button
                type="button"
                onClick={() => setIcon(null)}
                className={cn(
                  "cursor-pointer rounded-md px-1.5 text-xs text-muted-foreground hover:text-foreground",
                  icon === null && "text-foreground",
                )}
              >
                Plain folder
              </button>
            </div>
            <div className="grid grid-cols-12 gap-1">
              {EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Use ${emoji}`}
                  aria-pressed={icon === emoji}
                  onClick={() => setIcon(emoji)}
                  className={cn(
                    "grid aspect-square cursor-pointer place-items-center rounded-lg text-lg transition-colors hover:bg-accent",
                    icon === emoji && "bg-accent ring-1 ring-ring",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <Input
              value={icon && !EMOJI.includes(icon) ? icon : ""}
              onChange={(event) => {
                const typed = [...new Intl.Segmenter().segment(event.target.value)].map(
                  (part) => part.segment,
                );
                setIcon(typed.length ? typed[typed.length - 1]! : null);
              }}
              placeholder="Or type any emoji (Ctrl ⌘ Space)"
              aria-label="Any emoji"
            />
          </section>

          <section className="flex flex-col gap-2">
            <span className="font-label text-2xs text-muted-foreground uppercase tracking-wider">
              Colour
            </span>
            <div className="flex flex-wrap gap-2">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="No colour"
                      aria-pressed={color === null}
                      onClick={() => setColor(null)}
                      className={cn(
                        swatchClass(color === null),
                        "border border-border bg-transparent",
                      )}
                    />
                  }
                />
                <TooltipPopup>No colour</TooltipPopup>
              </Tooltip>
              {colors.map((option) => (
                <Tooltip key={option.id}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={option.name}
                        aria-pressed={color === option.id}
                        onClick={() => setColor(option.id)}
                        style={{ background: option.swatch }}
                        className={swatchClass(color === option.id)}
                      />
                    }
                  />
                  <TooltipPopup>{option.name}</TooltipPopup>
                </Tooltip>
              ))}
            </div>
          </section>
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!name.trim()}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

/** Name, emoji and colour for a folder. */
export function FolderDialog() {
  const folderId = useFolderDialog((state) => state.folderId);
  const folder = useFolderStore((state) => (folderId ? (state.folders[folderId] ?? null) : null));
  return (
    <Dialog open={folder !== null} onOpenChange={(open) => (open ? null : close())}>
      <DialogPopup className="max-w-md">
        {folder ? <FolderForm key={folder.id} folder={folder} /> : null}
      </DialogPopup>
    </Dialog>
  );
}
