import type { RomeTab } from "@t3-ardia/entry";
import { useRouter } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  MousePointerClickIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import {
  createElement,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { readLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import { SiteIcon } from "../../components/sidebar/rome/BrowserTabRow";
import { Button } from "../../components/ui/button";
import { isElectron } from "../../env";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../workspaceTitlebar";
import { type AddressBarPlace, useAddressBarStore } from "./addressBarStore";
import { browser, useTab } from "./browserStore";
import { cancelPick, pickToChat, snapshotToChat } from "./pageToChat";

const splitUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const rest = `${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}`;
    return { host: parsed.host.replace(/^www\./, ""), rest };
  } catch {
    return { host: url, rest: "" };
  }
};

// A page's theme colour as RGB, read once per colour; null for colours that can't be drawn.
const parsed = new Map<string, readonly [number, number, number] | null>();
function rgbOf(color: string): readonly [number, number, number] | null {
  if (parsed.has(color)) return parsed.get(color)!;
  let rgb: readonly [number, number, number] | null = null;
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (context && CSS.supports("color", color)) {
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
    rgb = a > 200 ? [r, g, b] : null;
  }
  parsed.set(color, rgb);
  return rgb;
}

/**
 * Colours a page's chrome in the page's own theme colour, as browsers do, with text
 * and controls light or dark to stay readable on it. Nothing when the page has none.
 */
export function pageTint(themeColor: string | null): CSSProperties | undefined {
  const rgb = themeColor ? rgbOf(themeColor) : null;
  if (!rgb) return undefined;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
  const ink = dark ? "255 255 255" : "0 0 0";
  return {
    background: `rgb(${rgb.join(" ")})`,
    color: `rgb(${ink} / 0.92)`,
    "--contrast-foreground": `rgb(${ink} / 0.92)`,
    "--contrast-muted-foreground": `rgb(${ink} / 0.6)`,
    "--contrast-border": `rgb(${ink} / 0.1)`,
    "--contrast-input": `rgb(${ink} / 0.14)`,
    "--contrast-placeholder": `rgb(${ink} / 0.45)`,
    "--accent": `rgb(${ink} / 0.1)`,
    "--contrast-accent-foreground": `rgb(${ink} / 0.95)`,
  } as CSSProperties;
}

/** Right-click on a page's controls: move them above the page or into the sidebar. */
export async function showAddressBarMenu(event: ReactMouseEvent, place: AddressBarPlace) {
  if (event.target instanceof HTMLInputElement) return;
  event.preventDefault();
  const api = readLocalApi();
  if (!api) return;
  const next: AddressBarPlace = place === "page" ? "sidebar" : "page";
  const clicked = await api.contextMenu
    .show(
      [
        {
          id: "move",
          label: next === "sidebar" ? "Show address in the sidebar" : "Show address above the page",
        },
      ],
      { x: event.clientX, y: event.clientY },
    )
    .catch(() => null);
  if (clicked === "move") useAddressBarStore.getState().setPlace(next);
}

/**
 * The tab's extension buttons, drawn by the extension system's own element: icons,
 * badges, popups, and a menu to remove an extension.
 */
export function ExtensionActions(props: { readonly tabId: string }) {
  const engine = browser()?.tabEngine(props.tabId) ?? null;
  if (!engine) return null;
  return createElement("browser-action-list", {
    partition: engine.partition,
    tab: String(engine.webContentsId),
    alignment: "bottom left",
    className: "rome-extension-actions",
  });
}

/**
 * Hands the page to a chat, as T3's preview does: pick elements on it (with a
 * comment, regions and strokes), or take what's on screen as an image. They go
 * to the tab's thread, the chat on screen, or a new chat.
 */
export function ChatTools(props: { readonly tabId: string }) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const pick = () => {
    if (picking) {
      cancelPick(props.tabId);
      return;
    }
    setPicking(true);
    void pickToChat(props.tabId, router).finally(() => setPicking(false));
  };
  return (
    <>
      <Button
        variant={picking ? "secondary" : "ghost-muted"}
        size="icon-xs"
        aria-label={picking ? "Stop picking" : "Pick from the page into a chat"}
        aria-pressed={picking}
        onClick={pick}
      >
        <MousePointerClickIcon />
      </Button>
      <Button
        variant="ghost-muted"
        size="icon-xs"
        aria-label="Add a snapshot of the page to a chat"
        onClick={() => void snapshotToChat(props.tabId, router)}
      >
        <CameraIcon />
      </Button>
    </>
  );
}

/** Back, forward, and reload (stop while loading). */
export function PageNavigation(props: { readonly tab: RomeTab }) {
  const { tab } = props;
  return (
    <>
      <Button
        variant="ghost-muted"
        size="icon-xs"
        aria-label="Back"
        disabled={!tab.canGoBack}
        onClick={() => browser()?.pageAction(tab.id, "back")}
      >
        <ArrowLeftIcon />
      </Button>
      <Button
        variant="ghost-muted"
        size="icon-xs"
        aria-label="Forward"
        disabled={!tab.canGoForward}
        onClick={() => browser()?.pageAction(tab.id, "forward")}
      >
        <ArrowRightIcon />
      </Button>
      <Button
        variant="ghost-muted"
        size="icon-xs"
        aria-label={tab.loading ? "Stop" : "Reload"}
        onClick={() => browser()?.pageAction(tab.id, tab.loading ? "stop" : "reload")}
      >
        {tab.loading ? <XIcon /> : <RotateCwIcon />}
      </Button>
    </>
  );
}

/** The page's address: its site and path, and a field to type another when clicked. */
export function AddressField(props: {
  readonly tab: RomeTab;
  readonly className?: string;
  /** Shows only the site, not the path (the sidebar's compact pill). */
  readonly hostOnly?: boolean;
}) {
  const { tab } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const { host, rest } = splitUrl(tab.url);
  const commit = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(null);
    } else if (event.key === "Enter" && editing?.trim()) {
      event.preventDefault();
      browser()?.navigateTab(tab.id, editing.trim());
      setEditing(null);
    }
  };
  if (editing === null) {
    return (
      <button
        type="button"
        onClick={() => setEditing(tab.url)}
        className={cn(
          "flex h-7 min-w-0 flex-1 cursor-text items-center gap-2 rounded-lg bg-accent/50 px-2.5 text-left text-xs outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          props.className,
        )}
      >
        <SiteIcon
          src={tab.favicon}
          className={cn("shrink-0", props.hostOnly ? "size-4" : "size-3.5")}
        />
        <span
          className={cn(
            "font-medium text-foreground",
            props.hostOnly ? "min-w-0 truncate" : "shrink-0",
          )}
        >
          {host}
        </span>
        {props.hostOnly ? null : (
          <span className="min-w-0 truncate text-muted-foreground">{rest}</span>
        )}
      </button>
    );
  }
  return (
    <input
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- Clicking the address starts typing a new one.
      autoFocus
      value={editing}
      onChange={(event) => setEditing(event.target.value)}
      onKeyDown={commit}
      onBlur={() => setEditing(null)}
      onFocus={(event) => event.currentTarget.select()}
      aria-label="Address"
      spellCheck={false}
      className={cn(
        "h-7 min-w-0 flex-1 rounded-lg bg-accent/50 px-2.5 text-xs outline-hidden ring-2 ring-ring",
        props.className,
      )}
    />
  );
}

/**
 * The page's own controls, drawn by the app in the page's theme colour: back,
 * forward, reload, the address, chat tools and extensions. At the window's left
 * edge (`titleBar`) it is also the title bar, so it leaves room for the window
 * controls while the sidebar is hidden.
 */
export function PageHeader(props: {
  readonly tabId: string;
  readonly onClose?: () => void;
  readonly titleBar?: boolean;
}) {
  const tab = useTab(props.tabId);
  const className = cn(
    "flex h-(--workspace-topbar-height) shrink-0 items-center gap-1 border-border border-b px-2",
    props.titleBar && isElectron && "drag-region",
    props.titleBar && COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
  );
  if (!tab) return <div className={className} />;
  return (
    <div
      className={className}
      style={pageTint(tab.themeColor)}
      onContextMenu={(event) => void showAddressBarMenu(event, "page")}
    >
      <PageNavigation tab={tab} />
      <AddressField tab={tab} className="ml-1" />
      <ChatTools tabId={props.tabId} />
      <ExtensionActions tabId={props.tabId} />
      {props.onClose ? (
        <Button variant="ghost-muted" size="icon-xs" aria-label="Close tab" onClick={props.onClose}>
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}
