// electron-builder afterPack hook: gives the packed app castlabs' production VMP
// signature, which Widevine services such as Spotify require. It runs only once
// an EVS account is set up (`python3 -m castlabs_evs.account signup`); until
// then the app keeps castlabs' development signature, which plays test streams
// but not most services. Signing must happen before any Apple code signing.
const NodeChildProcess = require("node:child_process");
const NodeFS = require("node:fs");
const NodeOS = require("node:os");
const NodePath = require("node:path");

exports.default = async function signWithCastlabsVmp(context) {
  if (context.electronPlatformName !== "darwin") return;
  const account = NodePath.join(NodeOS.homedir(), ".config", "evs", "config.json");
  if (!NodeFS.existsSync(account)) {
    console.warn(
      "[castlabs-vmp] No EVS account, so the app keeps the development VMP signature; Spotify and similar services won't play.",
    );
    return;
  }
  NodeChildProcess.execFileSync(
    "python3",
    ["-m", "castlabs_evs.vmp", "--no-ask", "sign-pkg", context.appOutDir],
    { stdio: "inherit" },
  );
};
