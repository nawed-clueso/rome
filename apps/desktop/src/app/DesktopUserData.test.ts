import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveUserDataPath } from "./DesktopUserData.ts";

it.effect.each(["t3code", "T3 Code (Alpha)", "t3code-v2"])(
  "keeps Rome's profile apart from T3 Code's %s profile, credential keys included",
  (sourceName) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "rome-profile-" });
      const source = path.join(directory, sourceName);
      const state = '{"os_crypt":{"encrypted_key":"test-encrypted-key"}}';
      yield* fs.makeDirectory(source, { recursive: true });
      yield* fs.writeFileString(path.join(source, "Local State"), state);
      const resolved = yield* resolveUserDataPath({
        appDataDirectory: directory,
        isDevelopment: false,
        platform: "win32",
      });
      assert.equal(resolved, path.join(directory, "rome"));
      assert.isFalse(yield* fs.exists(path.join(resolved, "Local State")));
      assert.equal(yield* fs.readFileString(path.join(source, "Local State")), state);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
