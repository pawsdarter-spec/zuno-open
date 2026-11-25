#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then open https://nodejs.org/; exit 1; fi
[ -d node_modules/electron-builder ] || npm install || exit 1
npx electron-builder --mac && open dist
read -p "Press Enter to close..."
