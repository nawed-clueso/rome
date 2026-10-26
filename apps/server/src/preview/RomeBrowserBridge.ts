import {
  type RomeBrowserOperation,
  type RomeBrowserRequest,
  type RomeBrowserRespondInput,
  type ThreadId,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

// Rome's browser lives in the Rome app, not on the server. An agent's browser
// tools ask through here: the request goes to every Rome window listening, the
// one that holds the chat's space answers, and the first answer wins.

export class RomeBrowserUnavailableError extends Schema.TaggedError<RomeBrowserUnavailableError>()(
  "RomeBrowserUnavailableError",
  { message: Schema.String },
) {}

const REQUEST_TIMEOUT = Duration.seconds(30);

type Pending = Deferred.Deferred<unknown, RomeBrowserUnavailableError>;

export class RomeBrowserBridge extends Context.Service<
  RomeBrowserBridge,
  {
    /** Asks the Rome app, for a chat, and waits for its answer. */
    readonly request: (
      threadId: ThreadId,
      operation: RomeBrowserOperation,
      input: unknown,
    ) => Effect.Effect<unknown, RomeBrowserUnavailableError>;
    readonly respond: (input: RomeBrowserRespondInput) => Effect.Effect<void>;
    /** The requests, for a Rome window to answer. */
    readonly requests: Stream.Stream<RomeBrowserRequest>;
  }
>()("t3/preview/RomeBrowserBridge") {}

export const make = Effect.gen(function* () {
  const pubsub = yield* PubSub.unbounded<RomeBrowserRequest>();
  const pending = new Map<string, Pending>();
  const listeners = yield* Ref.make(0);
  let sequence = 0;

  const request = Effect.fn("RomeBrowserBridge.request")(function* (
    threadId: ThreadId,
    operation: RomeBrowserOperation,
    input: unknown,
  ) {
    if ((yield* Ref.get(listeners)) === 0) {
      return yield* new RomeBrowserUnavailableError({
        message: "Rome's browser isn't open. These tools work in the Rome desktop app.",
      });
    }
    sequence += 1;
    const requestId = `rb-${(yield* Clock.currentTimeMillis).toString(36)}-${sequence}`;
    const answer: Pending = yield* Deferred.make<unknown, RomeBrowserUnavailableError>();
    pending.set(requestId, answer);
    yield* PubSub.publish(pubsub, { requestId, threadId, operation, input });
    return yield* Deferred.await(answer).pipe(
      Effect.timeoutOrElse({
        duration: REQUEST_TIMEOUT,
        orElse: () =>
          Effect.fail(
            new RomeBrowserUnavailableError({
              message: "Rome's browser didn't answer. Is the chat's space open in a Rome window?",
            }),
          ),
      }),
      Effect.ensuring(Effect.sync(() => pending.delete(requestId))),
    );
  });

  const respond = Effect.fn("RomeBrowserBridge.respond")(function* (
    input: RomeBrowserRespondInput,
  ) {
    const answer = pending.get(input.requestId);
    if (!answer) return;
    pending.delete(input.requestId);
    if (input.ok) yield* Deferred.succeed(answer, input.value ?? null);
    else {
      yield* Deferred.fail(
        answer,
        new RomeBrowserUnavailableError({ message: input.message ?? "Rome's browser refused." }),
      );
    }
  });

  const requests: Stream.Stream<RomeBrowserRequest> = Stream.unwrap(
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Ref.update(listeners, (n) => n + 1),
        () => Ref.update(listeners, (n) => n - 1),
      );
      return Stream.fromPubSub(pubsub);
    }),
  );

  return RomeBrowserBridge.of({ request, respond, requests });
});

export const layer = Layer.effect(RomeBrowserBridge, make);
