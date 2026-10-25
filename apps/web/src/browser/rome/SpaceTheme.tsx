import { useEffect, useLayoutEffect } from "react";

import { useTheme } from "../../hooks/useTheme";
import { useCurrentSpace } from "./browserStore";

/** Rome's themes, by theme id: the font pairing each brings and whether spaces tint the window. */
const LOOKS: Record<string, { readonly type: string; readonly tint: boolean }> = {
  "rome-matte": { type: "matte", tint: false },
  "rome-paper": { type: "paper", tint: false },
  "rome-midnight": { type: "midnight", tint: false },
  "rome-spaces": { type: "spaces", tint: true },
};

// Set once the first time Rome runs, when it starts the user on Matte Black.
const DEFAULT_LOOK_KEY = "rome:default-look:v1";

/**
 * Applies the current theme's Rome look: its font pairing, and with Spaces the
 * current space's tint behind the sidebar and around the content.
 */
export function SpaceTheme() {
  const space = useCurrentSpace();
  const { theme, resolvedTheme, setTheme, setAppearanceMode } = useTheme();
  const look = LOOKS[theme] ?? null;

  useEffect(() => {
    if (localStorage.getItem(DEFAULT_LOOK_KEY)) return;
    localStorage.setItem(DEFAULT_LOOK_KEY, "1");
    if (setTheme("rome-matte")) setAppearanceMode("dark");
  }, [setTheme, setAppearanceMode]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.rome = "";
    if (look) root.dataset.romeType = look.type;
    else delete root.dataset.romeType;
    if (look?.tint && space) {
      const [from, to] = resolvedTheme === "dark" ? space.tint.dark : space.tint.light;
      root.dataset.spaceTint = "";
      root.style.setProperty("--space-tint-from", from);
      root.style.setProperty("--space-tint-to", to);
    } else {
      delete root.dataset.spaceTint;
    }
    if (space) root.style.setProperty("--space-accent", space.accent);
  }, [look, space, resolvedTheme]);

  return null;
}
