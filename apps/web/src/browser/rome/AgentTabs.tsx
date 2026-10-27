import {
  parseScopedThreadKey,
  scopedThreadKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  type EnvironmentId,
  type RomeBrowserChangeResult,
  type RomeBrowserFolderInput,
  type RomeBrowserLayout,
  type RomeBrowserOperation,
  type RomeBrowserReadyTab,
  type RomeBrowserRequest,
  type RomeBrowserSpaceInput,
  type RomeBrowserViewInput,
  type RomeBrowserSplitInput,
  type RomeBrowserTab,
  type RomeBrowserTabInput,
  ThreadId,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/reactivity";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useEffectEvent } from "react";

import { previewEnvironment } from "~/state/preview";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import { useAtomCommand } from "~/state/use-atom-command";
import { noteAgentInput } from "./agentActivityStore";
import {
  changeFolder,
  changeSpace,
  changeSplit,
  changeTabs,
  changeView,
  describeLayout,
  type LayoutContext,
} from "./agentLayout";
import { browser, useBrowserModel } from "./browserStore";
import { useTabMentionStore } from "./tabMentionStore";
import { spaceOfThread, useThreadSpaceStore } from "./threadSpaceStore";
import { useShowTab } from "./useShowTab";

type AgentTabBridge = {
  agentTab?(
    operation: "share" | "unshare",
    threadId: string,
    tabId: string,
    webContentsId?: number,
  ): Promise<unknown>;
  onAgentInput?(listener: (webContentsId: number) => void): () => void;
};
const desktop = (globalThis as { ardiaDesktop?: AgentTabBridge }).ardiaDesktop ?? null;

type Shared = {
  /** The chat the tab is shared with, as a scoped thread key. */
  readonly holder: string;
  readonly threadId: string;
  readonly previewTabId: string;
  readonly webContentsId: number;
};
type Want = Omit<Shared, "previewTabId">;

// By browser tab id. A tab is shared once its page has loaded, and again when the
// pool gives it a new page. Kept for the window across reloads, so a reload ends
// the sessions it left behind instead of leaving the agent a dead tab.
const shared = new Map<string, Shared>();
const opening = new Map<string, Promise<Shared | null>>();
const SHARED_KEY = "rome:agent-tabs:v2";
const saveShared = () => {
  try {
    sessionStorage.setItem(SHARED_KEY, JSON.stringify([...shared.values()]));
  } catch {}
};
const leftBehind = (): Shared[] => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SHARED_KEY) ?? "[]") as Shared[];
    sessionStorage.removeItem(SHARED_KEY);
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};
let cleared = false;

// How often loaded pages are checked for, since a page loading changes nothing the model watches.
const RECHECK_MS = 4_000;
// How long browser_open and browser_use wait for a page to load.
const READY_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** The chat a tab is the agent's in: the chat it was last mentioned in, else the one it was opened from. */
const holderOf = (tab: { id: string; owner: string | null }, mentionedIn: Record<string, string>) =>
  mentionedIn[tab.id] ?? tab.owner;

// Requests from agents' browser tools, each heard once however often the atom remounts.
let answerRequest: ((request: RomeBrowserRequest) => void) | null = null;
const heard = new Set<string>();
const browserRequestsAtom = Atom.family((environmentId: EnvironmentId) => {
  const requests = previewEnvironment.browserRequests({ environmentId, input: {} });
  return Atom.make((get) => {
    get.subscribe(
      requests,
      (result) => {
        if (!AsyncResult.isSuccess(result) || heard.has(result.value.requestId)) return;
        heard.add(result.value.requestId);
        answerRequest?.(result.value);
      },
      { immediate: true },
    );
  }).pipe(Atom.withLabel(`rome:browser-requests:${environmentId}`));
});
const inactiveAtom = Atom.make(() => undefined);

/**
 * Shares each chat's browser tabs with that chat's agent, so its browser tools
 * (snapshot, click, type, evaluate…) work on the real tab, signed in as you. A
 * tab is a chat's when it was opened from the chat or @-mentioned in it, and is
 * shared with that chat only. Also answers the agent's browser_tabs,
 * browser_open and browser_use for chats whose space is in this window, and
 * the browser_layout, browser_tab, browser_split, browser_folder, browser_view and
 * browser_space tools that arrange the sidebar.
 */
export function AgentTabs() {
  const environmentId = useAtomValue(primaryEnvironmentIdAtom);
  const openSession = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const closeSession = useAtomCommand(previewEnvironment.close, { reportFailure: false });
  const respond = useAtomCommand(previewEnvironment.browserRespond, { reportFailure: false });
  const tabs = useBrowserModel((state) => state.browser?.tabs ?? null);
  const mentionedIn = useTabMentionStore((state) => state.mentionedIn);
  const showTab = useShowTab();
  const router = useRouter();
  useAtomValue(
    environmentId && desktop?.agentTab ? browserRequestsAtom(environmentId) : inactiveAtom,
  );

  const unshare = (entry: Shared) => {
    void desktop?.agentTab?.("unshare", entry.threadId, entry.previewTabId);
    if (environmentId) {
      void closeSession({
        environmentId,
        input: { threadId: ThreadId.make(entry.threadId), tabId: entry.previewTabId },
      });
    }
  };

  /** Shares a loaded tab with a chat; null when it couldn't be. */
  const share = useEffectEvent((tabId: string, want: Want): Promise<Shared | null> => {
    const pending = opening.get(tabId);
    if (pending) return pending;
    const run = (async () => {
      if (!environmentId || !desktop?.agentTab) return null;
      const result = await openSession({
        environmentId,
        input: {
          threadId: ThreadId.make(want.threadId),
          runtime: "server",
          surface: "ardia",
          reveal: false,
        },
      });
      if (!AsyncResult.isSuccess(result)) return null;
      const entry = { ...want, previewTabId: result.value.tabId };
      const ok = await desktop.agentTab(
        "share",
        want.threadId,
        entry.previewTabId,
        want.webContentsId,
      );
      if (!ok) {
        unshare(entry);
        return null;
      }
      shared.set(tabId, entry);
      saveShared();
      browser()?.setTabAgentDriven(tabId, true);
      return entry;
    })().finally(() => opening.delete(tabId));
    opening.set(tabId, run);
    return run;
  });

  const sync = useEffectEvent(async () => {
    const actions = browser();
    const model = actions ? tabs : null;
    if (!actions || !model || !environmentId || !desktop?.agentTab) return;
    if (!cleared) {
      cleared = true;
      for (const entry of leftBehind()) unshare(entry);
    }
    const wanted = new Map<string, Want>();
    for (const tab of Object.values(model)) {
      const holder = holderOf(tab, mentionedIn);
      if (!holder) continue;
      const ref = parseScopedThreadKey(holder);
      // The desktop drives pages for the backend it runs, not remote environments.
      if (!ref || ref.environmentId !== environmentId) continue;
      const engine = actions.tabEngine(tab.id);
      if (!engine) continue;
      wanted.set(tab.id, { holder, threadId: ref.threadId, webContentsId: engine.webContentsId });
    }
    for (const [tabId, entry] of shared) {
      const want = wanted.get(tabId);
      if (want && want.holder === entry.holder) continue;
      shared.delete(tabId);
      saveShared();
      actions.setTabAgentDriven(tabId, false);
      unshare(entry);
    }
    for (const [tabId, want] of wanted) {
      const entry = shared.get(tabId);
      if (!entry) {
        void share(tabId, want);
        continue;
      }
      if (entry.webContentsId === want.webContentsId) continue;
      shared.set(tabId, { ...entry, webContentsId: want.webContentsId });
      saveShared();
      void desktop.agentTab("share", entry.threadId, entry.previewTabId, want.webContentsId);
    }
  });

  /** Waits for a chat's tab to load and be shared with it. */
  const ready = async (tabId: string, holder: string, threadId: string) => {
    const deadline = performance.now() + READY_TIMEOUT_MS;
    for (;;) {
      const actions = browser();
      const tab = useBrowserModel.getState().browser?.tabs[tabId];
      if (!actions || !tab) throw new Error("The tab was closed.");
      let entry = shared.get(tabId);
      if (entry?.holder !== holder) {
        const engine = actions.tabEngine(tabId);
        if (engine && !entry) {
          entry =
            (await share(tabId, { holder, threadId, webContentsId: engine.webContentsId })) ??
            undefined;
        }
      }
      if (entry?.holder === holder) {
        return { tabId: entry.previewTabId, browserTabId: tabId, url: tab.url, title: tab.title };
      }
      if (performance.now() > deadline) throw new Error("The tab's page didn't load in time.");
      await sleep(150);
    }
  };

  const answer = async (
    operation: RomeBrowserOperation,
    input: unknown,
    holder: string,
    threadId: string,
    spaceId: string,
  ): Promise<
    { tabs: RomeBrowserTab[] } | RomeBrowserReadyTab | RomeBrowserLayout | RomeBrowserChangeResult
  > => {
    const actions = browser();
    const model = useBrowserModel.getState().browser;
    if (!actions || !model || !environmentId) throw new Error("Rome's browser hasn't loaded yet.");
    // The tool's schema checked the input on the server.
    const layout: LayoutContext = {
      environmentId,
      holder,
      spaceId,
      showTab,
      navigate: (route) => void router.navigate(route as Parameters<typeof router.navigate>[0]),
      pathname: () => router.state.location.pathname,
    };
    if (operation === "layout") return describeLayout(layout);
    if (operation === "tab") return changeTabs(input as RomeBrowserTabInput, layout);
    if (operation === "split") return changeSplit(input as RomeBrowserSplitInput, layout);
    if (operation === "folder") return changeFolder(input as RomeBrowserFolderInput, layout);
    if (operation === "space") return changeSpace(input as RomeBrowserSpaceInput, layout);
    if (operation === "view") return changeView(input as RomeBrowserViewInput, layout);
    const mentions = useTabMentionStore.getState().mentionedIn;
    if (operation === "tabs") {
      const spaceNames = new Map(model.spaces.map((space) => [space.id, space.name]));
      return {
        tabs: Object.values(model.tabs)
          .filter((tab) => holderOf(tab, mentions) === holder)
          .map((tab) => {
            const entry = shared.get(tab.id);
            return {
              browserTabId: tab.id,
              title: tab.title,
              url: tab.url,
              space: spaceNames.get(tab.spaceId) ?? "",
              reason: mentions[tab.id] === holder ? ("mentioned" as const) : ("owned" as const),
              tabId: entry?.holder === holder ? entry.previewTabId : null,
            };
          }),
      };
    }
    if (operation === "open") {
      const { url, background } = (input ?? {}) as { url?: unknown; background?: unknown };
      if (typeof url !== "string" || !/^https?:\/\//iu.test(url)) {
        throw new Error("browser_open takes a full http or https URL.");
      }
      const tabId = actions.openTab(url, {
        owner: holder,
        spaceId,
        background: background !== false,
      });
      if (!tabId) throw new Error("Rome couldn't open the tab.");
      return ready(tabId, holder, threadId);
    }
    const { browserTabId } = (input ?? {}) as { browserTabId?: unknown };
    const tab = typeof browserTabId === "string" ? model.tabs[browserTabId] : undefined;
    if (!tab) throw new Error("No such tab. Call browser_tabs for this chat's tabs.");
    if (holderOf(tab, mentions) !== holder) {
      throw new Error("That tab isn't this chat's. The user can @ it in the chat to share it.");
    }
    actions.wakeTab(tab.id);
    return ready(tab.id, holder, threadId);
  };

  const onRequest = useEffectEvent((request: RomeBrowserRequest) => {
    const model = useBrowserModel.getState().browser;
    if (!environmentId || !model) return;
    const holder = scopedThreadKey(scopeThreadRef(environmentId, request.threadId));
    const spaceId = spaceOfThread(
      useThreadSpaceStore.getState().spaceOf,
      holder,
      model.spaces.map((space) => space.id),
    );
    // The window holding the chat's space answers; the others leave it be.
    if (!spaceId || model.elsewhere[spaceId]) return;
    const reply = (result: { ok: true; value: unknown } | { ok: false; message: string }) =>
      void respond({ environmentId, input: { requestId: request.requestId, ...result } });
    answer(request.operation, request.input, holder, request.threadId, spaceId).then(
      (value) => reply({ ok: true, value }),
      (error: unknown) =>
        reply({ ok: false, message: error instanceof Error ? error.message : String(error) }),
    );
  });

  useEffect(() => {
    answerRequest = (request) => onRequest(request);
    // The agent at work in a shared tab shows on the tab in the sidebar.
    const stopInput = desktop?.onAgentInput?.((webContentsId) => {
      for (const [tabId, entry] of shared) {
        if (entry.webContentsId === webContentsId) noteAgentInput(tabId);
      }
    });
    return () => {
      answerRequest = null;
      stopInput?.();
    };
  }, []);

  useEffect(() => {
    void sync();
    const timer = window.setInterval(() => void sync(), RECHECK_MS);
    return () => window.clearInterval(timer);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A change of tabs, mentions or environment is what calls for a fresh sync.
  }, [tabs, mentionedIn, environmentId]);

  return null;
}
