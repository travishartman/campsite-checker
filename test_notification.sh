#!/bin/bash
# Test email notification system

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source environment variables
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  source "$SCRIPT_DIR/.env"
  echo "Loaded email configuration from .env"
  echo "GMAIL_EMAIL: $GMAIL_EMAIL"
  echo "NOTIFY_EMAIL: $NOTIFY_EMAIL"
else
  echo "Error: .env file not found"
  exit 1
fi

# Activate virtual environment
if [[ -d "$SCRIPT_DIR/myvenv" ]]; then
  source "$SCRIPT_DIR/myvenv/bin/activate"
fi

# Set test flag and run notifier
export TEST_NOTIFY=1
python3 "$SCRIPT_DIR/notifier.py"
