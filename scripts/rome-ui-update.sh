#!/bin/bash
# Updates the installed Rome's interface without a full build: builds the web
# app into ~/.rome/ui, which Rome serves in place of its packaged copy, then
# touches ~/.rome/ui.stamp so Rome reloads its window onto it.
#
# Only apps/web (and the browser under it) can change this way. The desktop
# shell, the server and the shared packages ship in the app itself, so changes
# there still need a full build and install; the script stops when it sees them.
#
#   scripts/rome-ui-update.sh           build and install the interface
#   scripts/rome-ui-update.sh --force   install even if other code changed
#   scripts/rome-ui-update.sh --reset   go back to the interface Rome shipped with
#   scripts/rome-ui-update.sh --mark-installed
#                                       record the code a full install was built
#                                       from, and drop any interface update
set -euo pipefail
unset ELECTRON_RUN_AS_NODE

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${T3CODE_HOME:-$HOME/.rome}"
UI="$BASE/ui"
STAMP="$BASE/ui.stamp"
INSTALLED_CODE="$BASE/ui-installed-code"
APP="/Applications/Rome.app"

# A fingerprint of the code that ships in the app rather than the interface.
shell_code() {
  cd "$REPO"
  find apps/desktop/src apps/server/src packages/*/src -type f -not -name '*.test.*' -print0 |
    sort -z | xargs -0 shasum | shasum | cut -d' ' -f1
}

case "${1:-}" in
  --mark-installed)
    rm -rf "$UI" "$STAMP"
    shell_code > "$INSTALLED_CODE"
    exit 0
    ;;
  --reset)
    rm -rf "$UI"
    touch "$STAMP"
    echo "Rome is back on the interface it shipped with."
    exit 0
    ;;
  --force | "") ;;
  *)
    echo "Unknown option: $1" >&2
    exit 64
    ;;
esac

if [ ! -f "$INSTALLED_CODE" ]; then
  echo "The installed Rome predates interface updates: install a full build first." >&2
  exit 1
fi
if [ "${1:-}" != "--force" ] && [ "$(shell_code)" != "$(cat "$INSTALLED_CODE")" ]; then
  echo "Code outside apps/web changed since the last full install, so the new interface" >&2
  echo "may not match the installed app. Install a full build, or pass --force." >&2
  exit 1
fi

VERSION="$(defaults read "$APP/Contents/Info" CFBundleShortVersionString)"
cd "$REPO/apps/web"
APP_VERSION="$VERSION" vp build
cd "$REPO"
node scripts/apply-web-brand-assets.ts production apps/web/dist

# Older chunks stay, so a page still open on the last interface can load them
# until it reloads; index.html goes last, when everything it names is in place.
mkdir -p "$UI"
rsync -a --exclude index.html apps/web/dist/ "$UI/"
cp apps/web/dist/index.html "$UI/index.html.next"
mv "$UI/index.html.next" "$UI/index.html"
touch "$STAMP"
echo "Rome's interface is updated; its window reloads on its own."
