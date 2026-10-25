import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as ChildRepositoryScanner from "./ChildRepositoryScanner.ts";

const makeTempDir = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3code-child-repositories-" });
});

/** A checkout with a `.git` directory, or a worktree's `.git` file. */
const makeRepository = Effect.fn("makeRepository")(function* (
  root: string,
  relativePath: string,
  kind: "directory" | "file" = "directory",
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = path.join(root, relativePath);
  yield* fileSystem.makeDirectory(folder, { recursive: true }).pipe(Effect.orDie);
  const gitPath = path.join(folder, ".git");
  yield* kind === "directory"
    ? fileSystem.makeDirectory(gitPath).pipe(Effect.orDie)
    : fileSystem.writeFileString(gitPath, "gitdir: /elsewhere\n").pipe(Effect.orDie);
});

const relativeTo = (root: string, found: ReadonlyArray<string>) =>
  Effect.map(Path.Path, (path) => found.map((folder) => path.relative(root, folder)));

describe("ChildRepositoryScanner", () => {
  it.effect("finds checkouts and worktrees within the depth, nearest first", () =>
    Effect.gen(function* () {
      const root = yield* makeTempDir;
      yield* makeRepository(root, ".");
      yield* makeRepository(root, "repos/web");
      yield* makeRepository(root, "desks/one/web", "file");
      yield* makeRepository(root, "desks/one/web/nested");
      yield* makeRepository(root, "a/b/c/too-deep");
      const scanner = yield* ChildRepositoryScanner.make();

      expect(yield* relativeTo(root, yield* scanner.discover(root, 3))).toEqual([
        "repos/web",
        "desks/one/web",
      ]);
      expect(yield* relativeTo(root, yield* scanner.discover(root, 2))).toEqual(["repos/web"]);
      expect(yield* scanner.discover(root, 0)).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("skips dependency, build and hidden folders, and links", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* makeTempDir;
      const elsewhere = yield* makeTempDir;
      for (const skipped of ["node_modules/pkg", "dist/x", ".hidden/x", "target/x", "vendor/x"]) {
        yield* makeRepository(root, skipped);
      }
      yield* makeRepository(elsewhere, "linked");
      yield* fileSystem
        .symlink(path.join(elsewhere, "linked"), path.join(root, "linked"))
        .pipe(Effect.orDie);
      yield* makeRepository(root, "kept");
      const scanner = yield* ChildRepositoryScanner.make();

      expect(yield* relativeTo(root, yield* scanner.discover(root, 3))).toEqual(["kept"]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("stops at the repository and folder caps", () =>
    Effect.gen(function* () {
      const root = yield* makeTempDir;
      for (const name of ["a", "b", "c"]) yield* makeRepository(root, name);
      yield* makeRepository(root, "z/deeper");
      const capped = yield* ChildRepositoryScanner.make({ maxRepositories: 2 });
      expect(yield* relativeTo(root, yield* capped.discover(root, 2))).toEqual(["a", "b"]);

      // Only the root's own listing fits, so nothing below `z` is read.
      const shallow = yield* ChildRepositoryScanner.make({ maxDirectories: 1 });
      expect(yield* relativeTo(root, yield* shallow.discover(root, 2))).toEqual(["a", "b", "c"]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports nothing for a missing root instead of failing", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const root = yield* makeTempDir;
      const scanner = yield* ChildRepositoryScanner.make();
      expect(yield* scanner.discover(path.join(root, "missing"), 3)).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
