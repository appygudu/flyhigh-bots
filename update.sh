#!/usr/bin/env bash
# Refresh public/templates.json from live sources. Prints {"changed":bool,"count":n,"ids":[...]}.
# If changed is true, the caller (the daily routine) must redeploy via the user-Vercel MCP — see README.md.
set -euo pipefail
cd "$(dirname "$0")"
node update.mjs
