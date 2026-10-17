#!/bin/sh
# Renders each mockup to docs/images at 2x with headless Chrome.
# Usage: docs/mockups/render.sh [name ...]   (names without .html)
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
size() {
	case "$1" in
		channeltabs-overview) echo 1512,592 ;;
		channeltabs-folders) echo 1512,440 ;;
		threadnavigator-browser) echo 1512,812 ;;
		threadnavigator-bulk) echo 1112,612 ;;
		categoryalerts) echo 1312,712 ;;
	esac
}
names="$*"
[ -n "$names" ] || names="channeltabs-overview channeltabs-folders threadnavigator-browser threadnavigator-bulk categoryalerts"
for name in $names; do
	"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
		--force-device-scale-factor=2 --window-size="$(size "$name")" \
		--screenshot="$PWD/../images/$name.png" "file://$PWD/$name.html" 2>/dev/null
	echo "rendered $name"
done
