import type { ReactNode } from "react";
import { View } from "react-native";

type Inset = { top: number; right: number; bottom: number; left: number };

// In T3 Code the tabs, pins and spaces live in the app's own sidebar and the page
// sits in the app's own card, so the browser window is just the page: no docked
// sidebar, no peek from the left edge, and no margin around the card.
export function DockedLayout({
  fullscreen,
  children,
}: {
  fullscreen: boolean;
  topTabs: boolean;
  inset: Inset;
  children: ReactNode;
}) {
  return (
    <View style={fullscreen ? { flex: 1 } : { flex: 1, flexDirection: "row" }}>{children}</View>
  );
}
