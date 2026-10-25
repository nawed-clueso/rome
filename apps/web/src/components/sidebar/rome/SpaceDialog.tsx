import type { RomeSpace } from "@t3-ardia/entry";
import { useState } from "react";
import { create } from "zustand";

import { cn } from "~/lib/utils";
import { browser, useBrowserModel } from "../../../browser/rome/browserStore";
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
import { SpaceMark } from "./RomeSidebarTop";

const EMOJI = [
  "🏠",
  "💼",
  "🧪",
  "🎨",
  "📚",
  "🎧",
  "🎮",
  "🌱",
  "🔥",
  "⚡️",
  "🌙",
  "☀️",
  "🚀",
  "🧭",
  "🏛️",
  "🛠️",
  "💡",
  "🧠",
  "✍️",
  "📈",
  "💸",
  "🛒",
  "✈️",
  "🏃",
  "🍳",
  "🐙",
  "🦊",
  "🐝",
  "🌊",
  "🏔️",
  "🎬",
  "📷",
  "🎵",
  "❤️",
  "⭐️",
  "🧩",
];

type Target = { readonly mode: "edit"; readonly spaceId: string } | { readonly mode: "new" };

const useSpaceDialog = create<{ target: Target | null }>()(() => ({ target: null }));

export const editSpace = (spaceId: string) =>
  useSpaceDialog.setState({ target: { mode: "edit", spaceId } });
export const newSpace = () => useSpaceDialog.setState({ target: { mode: "new" } });
const close = () => useSpaceDialog.setState({ target: null });

function SpaceForm(props: { readonly target: Target; readonly space: RomeSpace | null }) {
  const colors = browser()?.SPACE_COLORS ?? [];
  const [name, setName] = useState(props.space?.name ?? "");
  const [icon, setIcon] = useState<string | null>(props.space?.icon ?? null);
  const [color, setColor] = useState(props.space?.color ?? colors[1]?.id ?? "blue");
  const swatch =
    colors.find((option) => option.id === color)?.swatch ?? props.space?.accent ?? "#888";
  const preview: RomeSpace = {
    id: props.space?.id ?? "new",
    name: name || "Space",
    icon,
    color,
    accent: swatch,
    tint: props.space?.tint ?? { light: ["#fff", "#fff"], dark: ["#000", "#000"] },
  };
  const save = () => {
    const actions = browser();
    const trimmed = name.trim();
    if (!actions || !trimmed) return;
    if (props.target.mode === "edit")
      actions.updateSpace(props.target.spaceId, { name: trimmed, icon, color });
    else actions.createSpace({ name: trimmed, icon, color });
    close();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{props.target.mode === "edit" ? "Customize space" : "New space"}</DialogTitle>
        <DialogDescription>A space keeps its own tabs, chats, sign-ins and look.</DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <SpaceMark space={preview} className="size-11 rounded-xl text-xl" />
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
            }}
            placeholder="Name"
            aria-label="Space name"
            className="flex-1"
          />
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-label text-[10.5px] text-muted-foreground uppercase tracking-[0.07em]">
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
              Use first letter
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
          <span className="font-label text-[10.5px] text-muted-foreground uppercase tracking-[0.07em]">
            Colour
          </span>
          <div className="flex flex-wrap gap-2">
            {colors.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.name}
                aria-label={option.name}
                aria-pressed={color === option.id}
                onClick={() => setColor(option.id)}
                style={{ background: option.swatch }}
                className={cn(
                  "size-7 cursor-pointer rounded-full ring-offset-2 ring-offset-popover transition-shadow",
                  color === option.id
                    ? "ring-2 ring-foreground"
                    : "hover:ring-2 hover:ring-foreground/30",
                )}
              />
            ))}
          </div>
        </section>
      </DialogPanel>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!name.trim()}>
          {props.target.mode === "edit" ? "Save" : "Create space"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Name, emoji and colour for a space, or a new one. */
export function SpaceDialog() {
  const target = useSpaceDialog((state) => state.target);
  const space = useBrowserModel((state) =>
    target?.mode === "edit"
      ? (state.browser?.spaces.find((option) => option.id === target.spaceId) ?? null)
      : null,
  );
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? null : close())}>
      <DialogPopup className="max-w-md">
        {target ? (
          <SpaceForm
            key={target.mode === "edit" ? target.spaceId : "new"}
            target={target}
            space={space}
          />
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}
