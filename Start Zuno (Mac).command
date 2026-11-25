#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js isn't installed yet. Install the LTS version, then open this file again."
  open https://nodejs.org/
  read -p "Press Enter to close..."
  exit 1
fi
if [ ! -d node_modules/electron ]; then
  echo "  First-time setup: downloading the app parts. This takes a few minutes..."
  npm install || { read -p "Setup failed. Press Enter to close..."; exit 1; }
fi
npx electron .
