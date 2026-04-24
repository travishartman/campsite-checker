#!/bin/bash
# Wrapper for LaunchAgent — sets full PATH before running camping_cron.sh
# LaunchAgents run with a minimal environment and won't find node/python3 otherwise.

export PATH="$HOME/.nvm/versions/node/v22.17.0/bin:/usr/local/bin:/usr/bin:/bin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/camping_cron.sh" "$@"
