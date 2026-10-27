import { createFileRoute, Navigate } from "@tanstack/react-router";

import { SplitLayout } from "../components/split/SplitLayout";
import { useSplitViewStore } from "../splitViewStore";

/** A split of only tabs, which has no chat to open it through. */
function SplitRoute() {
  const { splitId } = Route.useParams();
  const group = useSplitViewStore((state) => state.groups.find((entry) => entry.id === splitId));
  if (!group) return <Navigate to="/browse" replace />;
  return <SplitLayout group={group} />;
}

export const Route = createFileRoute("/_chat/split/$splitId")({
  component: SplitRoute,
});
