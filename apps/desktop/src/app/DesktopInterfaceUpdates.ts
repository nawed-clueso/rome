import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";

import * as DesktopWindow from "../window/DesktopWindow.ts";

// A quicker way to update Rome's interface than installing a new build:
// scripts/rome-ui-update.sh builds the web app into <base dir>/ui, which the
// app serves in place of its packaged copy, then touches <base dir>/ui.stamp
// so the window reloads onto it. A full install clears both.

const INTERFACE_DIRECTORY = "ui";
const INTERFACE_STAMP = "ui.stamp";

export const interfaceDirectory = (baseDir: string, join: (...parts: string[]) => string) =>
  join(baseDir, INTERFACE_DIRECTORY);

/** Reloads the main window whenever the update script touches the stamp in `baseDir`. */
export const watchInterfaceUpdates = Effect.fn("desktop.interfaceUpdates.watch")(function* (
  baseDir: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  const stamped = fileSystem.watch(baseDir).pipe(
    Stream.filter((event) => path.basename(event.path) === INTERFACE_STAMP),
    Stream.debounce(Duration.millis(300)),
  );
  yield* Stream.runForEach(stamped, () => desktopWindow.runMainContentsCommand("reload")).pipe(
    Effect.ignoreCause({ log: true }),
    Effect.forkScoped,
  );
});
