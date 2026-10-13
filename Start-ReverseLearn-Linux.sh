#!/bin/bash
cd "$(dirname "$0")"
echo "ReverseLearn - keep this window open while you use the app"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js is not installed yet - it is the free engine ReverseLearn runs on."
  echo "Opening the download page. Install the LTS version, then double-click this file again."
  xdg-open "https://nodejs.org/en/download"
  read -p "Press Enter to close..."
  exit 1
fi
if [ ! -d node_modules ]; then echo "First run only: installing (a few minutes)..."; npm install; fi
if [ ! -f .next/BUILD_ID ]; then echo "First run only: preparing the app..."; npm run build; fi
echo "Starting at http://localhost:3000  (close this window to stop)"
( sleep 5; xdg-open "http://localhost:3000" ) &
npm run start -- -p 3000
