#!/usr/bin/env bash
# Renders store/screenshots/{en,ko}-{1..5}.png (1280x800) with headless Chrome.
# Needs the harness server running: python store/shots/serve.py 8765
set -euo pipefail
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
OUT="$(cd "$(dirname "$0")/../screenshots" && pwd)"
W="$(cygpath -w "$OUT" 2>/dev/null || echo "$OUT")"
for lang in en ko; do
  for n in 1 2 3 4 5; do
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --mute-audio --force-device-scale-factor=1 \
      --window-size=1280,800 --virtual-time-budget=8000 --user-data-dir="${TMPDIR:-/tmp}/btshots-$lang-$n-$$" \
      --screenshot="${W}/${lang}-${n}.png" "http://localhost:8765/store/shots/compose.html?n=$n&lang=$lang" 2>&1 | grep -q written
    echo "${lang}-${n}.png"
  done
done
