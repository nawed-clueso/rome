/**
 * Pick and snapshot for the browser's tabs, as T3's own preview offers them:
 * click elements on the page (with a comment, regions and strokes) to hand them
 * to a chat, or take the whole visible page as an image. The page side is the
 * same annotation overlay the preview uses (preview-pick-preload), loaded into
 * every tab; this is the main-process side for one tab's guest.
 */
import type {
  DesktopPreviewAnnotationTheme,
  PreviewAnnotationSubmissionResult,
} from "@t3tools/contracts";
import type * as Electron from "electron";

import {
  ANNOTATION_CAPTURED_CHANNEL,
  CANCEL_PICK_CHANNEL,
  ELEMENT_PICKED_CHANNEL,
  START_PICK_CHANNEL,
} from "../preview/GuestProtocol.ts";
import { cropAnnotationScreenshot, normalizeCaptureRect } from "../preview/Manager.ts";
import { isPreviewAnnotationPayload } from "../preview/PickedElementPayload.ts";

// The pick running in each tab, by guest id, to cancel it.
const sessions = new Map<number, () => void>();

/** Cancels the pick running in a tab, if any. */
export const cancelPick = (guest: Electron.WebContents): void => sessions.get(guest.id)?.();

/**
 * Runs one pick in a tab: resolves with what the user annotated and a crop of
 * the page around it, or null if they cancelled, navigated or closed the tab.
 */
export function pickInGuest(
  guest: Electron.WebContents,
  theme: DesktopPreviewAnnotationTheme,
): Promise<PreviewAnnotationSubmissionResult | null> {
  cancelPick(guest);
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      guest.ipc.removeListener(ELEMENT_PICKED_CHANNEL, onMessage);
      guest.off("destroyed", onDestroyed);
      guest.off("did-start-navigation", onNavigated);
      if (sessions.get(guest.id) === cancel) sessions.delete(guest.id);
    };
    const finish = (result: PreviewAnnotationSubmissionResult | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const cancel = () => {
      if (!guest.isDestroyed()) guest.send(CANCEL_PICK_CHANNEL);
      finish(null);
    };
    const onMessage = (_event: Electron.IpcMainEvent, ...args: unknown[]) => {
      const payload = args[0];
      if (!isPreviewAnnotationPayload(payload)) {
        finish(null);
        return;
      }
      const cropRect = normalizeCaptureRect(args[1]);
      const devicePixelRatio = typeof args[3] === "number" ? args[3] : 1;
      const targets = [
        ...payload.elements.map((target) => target.rect),
        ...payload.regions.map((target) => target.rect),
        ...payload.strokes.map((target) => target.bounds),
      ];
      // Chats send from the composer, so a pick only ever attaches.
      void guest
        .capturePage()
        .then((image) => cropAnnotationScreenshot(image, cropRect, devicePixelRatio, targets))
        .catch(() => null)
        .then((screenshot) => {
          if (settled) return;
          if (!guest.isDestroyed()) guest.send(ANNOTATION_CAPTURED_CHANNEL);
          finish(
            screenshot
              ? { annotation: { ...payload, screenshot }, submission: "attach" }
              : { annotation: payload, submission: "attach", screenshotFailed: true },
          );
        });
    };
    const onDestroyed = () => finish(null);
    const onNavigated = (
      event: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
    ) => {
      if (event.isMainFrame) finish(null);
    };
    sessions.set(guest.id, cancel);
    guest.ipc.on(ELEMENT_PICKED_CHANNEL, onMessage);
    guest.once("destroyed", onDestroyed);
    guest.on("did-start-navigation", onNavigated);
    if (!guest.isFocused()) guest.focus();
    guest.send(START_PICK_CHANNEL, theme, false);
  });
}

/** The tab's visible page as a PNG data URL. */
export async function snapshotGuest(guest: Electron.WebContents): Promise<string | null> {
  try {
    const image = await guest.capturePage();
    return image.isEmpty() ? null : image.toDataURL();
  } catch {
    return null;
  }
}
