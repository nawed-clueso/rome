import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";

import { type SplitGroup, splitMembers, splitTabId } from "../../splitViewStore";
import { buildThreadRouteParams } from "../../threadRoutes";

/** Where a split opens: through one of its chats, or on its own page when it holds only tabs. */
export function splitRoute(group: SplitGroup) {
  const chat = splitMembers(group).find((key) => !splitTabId(key));
  const ref = chat ? parseScopedThreadKey(chat) : null;
  return ref
    ? ({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) } as const)
    : ({ to: "/split/$splitId", params: { splitId: group.id } } as const);
}
