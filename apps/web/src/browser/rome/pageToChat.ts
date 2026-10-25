import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type PreviewAnnotationSubmissionResult,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";

import { readFileAsDataUrl } from "../../components/ChatView.logic";
import { stackedThreadToast, toastManager } from "../../components/ui/toast";
import {
  type ComposerImageAttachment,
  type DraftId,
  useComposerDraftStore,
} from "../../composerDraftStore";
import { compressImageToByteLimit, dataUrlToFile } from "../../lib/imageCompression";
import { dispatchSnapShotComposerFocus } from "../../lib/desktopSnapShot";
import { capturePreviewAnnotationScreenshot } from "../../lib/previewAnnotation";
import { randomUUID } from "../../lib/utils";
import { openNewScreen } from "../../newScreenStore";
import { resolveThreadRouteTarget } from "../../threadRoutes";
import { readPreviewAnnotationTheme } from "../annotationTheme";
import { browser, useBrowserModel } from "./browserStore";

// Picks and snapshots from a browser tab go into a chat, as they do from T3's
// own preview: the tab's thread when it has one, else the chat on screen, else
// a new chat.

type ChatTarget = ScopedThreadRef | DraftId;

/** The chat on screen, from the route: a thread or a draft. */
function routeTarget(router: AnyRouter): ChatTarget | null {
  const params = (router.state.matches.at(-1)?.params ?? {}) as Record<string, string | undefined>;
  const target = resolveThreadRouteTarget({
    environmentId: params.environmentId,
    threadId: params.threadId,
    draftId: params.draftId,
  });
  if (!target) return null;
  return target.kind === "server" ? target.threadRef : target.draftId;
}

/** The chat a tab's picks should go to, if one is already there. */
function existingTarget(tabId: string, router: AnyRouter): ChatTarget | null {
  const owner = useBrowserModel.getState().browser?.tabs[tabId]?.owner;
  const ownerRef = owner ? parseScopedThreadKey(owner) : null;
  return ownerRef ?? routeTarget(router);
}

/** Opens the New screen as a chat and resolves with its draft once the route shows it. */
function newChatTarget(router: AnyRouter): Promise<DraftId | null> {
  openNewScreen("chat");
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      const target = routeTarget(router);
      if (typeof target === "string") resolve(target);
      else if (Date.now() - started > 3000) resolve(null);
      else setTimeout(check, 50);
    };
    check();
  });
}

const fail = (title: string, description: string) =>
  toastManager.add(stackedThreadToast({ type: "error", title, description }));

/** Adds the tab's visible page to a chat as an image. */
export async function snapshotToChat(tabId: string, router: AnyRouter) {
  const dataUrl = await browser()?.snapshotTab(tabId);
  if (!dataUrl)
    return fail("Could not capture the page", "The tab has nothing on screen to capture.");
  const original = dataUrlToFile(dataUrl, "page.png", "image/png");
  const compressed = await compressImageToByteLimit(original, PROVIDER_SEND_TURN_MAX_IMAGE_BYTES);
  if (!compressed.ok)
    return fail("Could not attach the page", "The capture is too large to attach.");
  const file = compressed.file;
  const previewUrl = compressed.recompressed ? await readFileAsDataUrl(file) : dataUrl;
  const target = existingTarget(tabId, router) ?? (await newChatTarget(router));
  if (!target) return fail("Could not attach the page", "No chat was open to attach it to.");
  const image: ComposerImageAttachment = {
    type: "image",
    id: randomUUID(),
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    previewUrl,
    file,
  };
  if (!useComposerDraftStore.getState().addImage(target, image)) {
    return fail("Could not attach the page", "Remove an attachment, then try again.");
  }
  dispatchSnapShotComposerFocus();
}

/**
 * Lets the user pick on the tab's page (click elements, draw, comment), then adds
 * what they picked, with a crop of the page, to a chat. Resolves once done.
 */
export async function pickToChat(tabId: string, router: AnyRouter) {
  const result = (await browser()?.pickInTab(tabId, readPreviewAnnotationTheme())) as
    | PreviewAnnotationSubmissionResult
    | null
    | undefined;
  if (!result) return;
  const { annotation: picked, screenshotFailed = false } = result;
  const capture = capturePreviewAnnotationScreenshot(picked);
  const annotation = capture.status === "failed" ? { ...picked, screenshot: null } : picked;
  const target = existingTarget(tabId, router) ?? (await newChatTarget(router));
  if (!target) return fail("Could not add the pick", "No chat was open to add it to.");
  const store = useComposerDraftStore.getState();
  store.addPreviewAnnotation(target, annotation);
  if (screenshotFailed || capture.status === "failed") {
    fail("Could not capture the picked element", "The annotation was kept without the screenshot.");
  }
  if (capture.status === "captured" && annotation.screenshot) {
    // The image shares the annotation's id, which ties the crop to its chip.
    store.addImage(target, {
      type: "image",
      id: annotation.id,
      name: capture.file.name,
      mimeType: capture.file.type,
      sizeBytes: capture.file.size,
      previewUrl: annotation.screenshot.dataUrl,
      file: capture.file,
    });
  }
  dispatchSnapShotComposerFocus();
}

export const cancelPick = (tabId: string) => browser()?.cancelPickInTab(tabId);
