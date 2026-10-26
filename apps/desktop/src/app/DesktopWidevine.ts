import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Electron from "electron";

// Rome runs on castlabs' Electron, which brings Google's Widevine module for
// protected media (Spotify, Netflix). Its updater installs the module on first
// launch, into the user data folder, and keeps it current; pages loaded before
// it is ready can't play protected media until they reload.

/** How long startup waits for the module before opening windows anyway. */
const STARTUP_WAIT = Duration.seconds(5);

export const startWidevine = Effect.gen(function* () {
  const ready = Effect.tryPromise(() =>
    Electron.components.whenReady([Electron.components.WIDEVINE_CDM_ID]),
  ).pipe(
    Effect.andThen(() =>
      Effect.logInfo("widevine ready", { components: Electron.components.status() }),
    ),
    Effect.catchCause((cause) => Effect.logWarning("widevine unavailable", { cause })),
  );
  const fiber = yield* Effect.forkDetach(ready);
  yield* Fiber.await(fiber).pipe(Effect.timeoutOption(STARTUP_WAIT));
}).pipe(Effect.withSpan("desktop.widevine.start"));
