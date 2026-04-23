#!/bin/bash
# Sends a test email simulating an available campsite, to verify booking link format
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SCRIPT_DIR/myvenv/bin/activate"
source "$SCRIPT_DIR/.env"

export CHECK_START_DATE="2026-09-22"
export CHECK_END_DATE="2026-09-24"
export CAMP4_START_DATE="2026-05-06"
export CAMP4_END_DATE="2026-05-08"

python3 "$SCRIPT_DIR/notifier.py" <<'EOF'
--- Valley Campgrounds (2026-09-22 to 2026-09-24) ---
There are campsites available!!!
🏕 Lower Pines Campground (232450): 3 site(s) available out of 74 site(s)
❌ Upper Pines Campground (232447): 0 site(s) available out of 236 site(s)

--- Camp 4 (2026-05-06 to 2026-05-08) ---
There are no campsites available :(
❌ Camp 4 (10004152): 0 site(s) available out of 1 site(s)
EOF
