import * as Cache from "effect/Cache";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

const CHILD_REPOSITORY_CACHE_CAPACITY = 64;
const CHILD_REPOSITORY_CACHE_TTL = Duration.minutes(5);
const ENTRY_CONCURRENCY = 16;

/** Folders that hold dependencies or build output rather than checkouts of their own. */
const SKIPPED_FOLDERS: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  "build",
  "target",
  "vendor",
  "Pods",
]);

interface InspectedEntry {
  readonly child: string;
  readonly isRepository: boolean;
  readonly isDirectory: boolean;
}

export interface ChildRepositoryScannerOptions {
  /** Folders whose listings may be read in one walk, the root included. */
  readonly maxDirectories?: number;
  /** Repositories one walk may report before it stops. */
  readonly maxRepositories?: number;
  /** Folder entries one walk may inspect, so a root of many files stays cheap. */
  readonly maxEntries?: number;
}

export class ChildRepositoryScanner extends Context.Service<
  ChildRepositoryScanner,
  {
    /**
     * Git checkouts below `root`, at most `maxDepth` folders down, nearest first. A folder holding
     * `.git` (a directory, or the file a worktree has) is a checkout and is not looked inside;
     * `root` itself is never reported. Never fails: an unreadable folder is skipped.
     */
    readonly discover: (root: string, maxDepth: number) => Effect.Effect<ReadonlyArray<string>>;
  }
>()("t3/project/ChildRepositoryScanner") {}

export const make = Effect.fn("ChildRepositoryScanner.make")(function* (
  options: ChildRepositoryScannerOptions = {},
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const maxDirectories = options.maxDirectories ?? 2_000;
  const maxRepositories = options.maxRepositories ?? 50;
  const maxEntries = options.maxEntries ?? 20_000;

  /** A folder worth looking at: not a link, since that can loop or leave the project. */
  const isPlainDirectory = (candidate: string) =>
    fileSystem.stat(candidate).pipe(
      Effect.flatMap((info) =>
        info.type !== "Directory"
          ? Effect.succeed(false)
          : fileSystem
              .readLink(candidate)
              .pipe(Effect.match({ onFailure: () => true, onSuccess: () => false })),
      ),
      Effect.orElseSucceed(() => false),
    );

  const walk = Effect.fnUntraced(function* (
    root: string,
    maxDepth: number,
  ): Effect.fn.Return<ReadonlyArray<string>> {
    const found: string[] = [];
    let directoriesRead = 0;
    let entriesSeen = 0;
    let level: ReadonlyArray<string> = [root];
    for (let depth = 1; depth <= maxDepth && level.length > 0; depth += 1) {
      const next: string[] = [];
      for (const directory of level) {
        if (directoriesRead >= maxDirectories || found.length >= maxRepositories) break;
        directoriesRead += 1;
        const names = yield* fileSystem.readDirectory(directory).pipe(
          Effect.catch((cause) =>
            Effect.logDebug("Could not list a folder while looking for repositories", {
              directory,
              cause,
            }).pipe(Effect.as([] as ReadonlyArray<string>)),
          ),
        );
        const candidates = names
          .filter((name) => !name.startsWith(".") && !SKIPPED_FOLDERS.has(name))
          .toSorted((left, right) => left.localeCompare(right))
          .slice(0, Math.max(0, maxEntries - entriesSeen));
        entriesSeen += candidates.length;
        const inspected = yield* Effect.forEach(
          candidates,
          (name): Effect.Effect<InspectedEntry> => {
            const child = path.join(directory, name);
            return isPlainDirectory(child).pipe(
              Effect.flatMap((isDirectory): Effect.Effect<InspectedEntry> =>
                isDirectory
                  ? fileSystem.exists(path.join(child, ".git")).pipe(
                      Effect.orElseSucceed(() => false),
                      Effect.map((isRepository) => ({ child, isRepository, isDirectory })),
                    )
                  : Effect.succeed({ child, isRepository: false, isDirectory }),
              ),
            );
          },
          { concurrency: ENTRY_CONCURRENCY },
        );
        for (const { child, isRepository, isDirectory } of inspected) {
          if (isRepository) {
            if (found.length < maxRepositories) found.push(child);
          } else if (isDirectory && depth < maxDepth) {
            next.push(child);
          }
        }
      }
      level = next;
    }
    return found as ReadonlyArray<string>;
  });

  const cache = yield* Cache.makeWith(
    (key: string) => {
      const [root, maxDepth] = JSON.parse(key) as [string, number];
      return walk(root, maxDepth).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Could not look for repositories in child folders", {
            root,
            cause,
          }).pipe(Effect.as([] as ReadonlyArray<string>)),
        ),
      );
    },
    { capacity: CHILD_REPOSITORY_CACHE_CAPACITY, timeToLive: () => CHILD_REPOSITORY_CACHE_TTL },
  );

  const discover: ChildRepositoryScanner["Service"]["discover"] = (root, maxDepth) => {
    const depth = Math.trunc(maxDepth);
    return depth <= 0 || root.length === 0
      ? Effect.succeed([])
      : Cache.get(cache, JSON.stringify([root, depth]));
  };

  return ChildRepositoryScanner.of({ discover });
});

export const layer = Layer.effect(ChildRepositoryScanner, make());
