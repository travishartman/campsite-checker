#!/bin/bash
# Simple cron job script to check campsite availability and send notification
# Add to crontab: */5 * * * * /path/to/camping_cron.sh

# --- Config ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"  # Override if needed
CAMPING_PY="${CAMPING_PY:-$SCRIPT_DIR/camping.py}"
NOTIFIER_PY="${NOTIFIER_PY:-$SCRIPT_DIR/notifier.py}"

# Compute dates via Python so this works on both macOS and Linux
eval $("$PYTHON_BIN" - <<'PYEOF'
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
today = date.today()
print(f"START_DATE={today + relativedelta(months=5) - timedelta(days=1)}")
print(f"END_DATE={today + relativedelta(months=5) + timedelta(days=1)}")
print(f"FULL_START_DATE={today}")
print(f"FULL_END_DATE={today + relativedelta(months=5)}")
print(f"CAMP4_START_DATE={today + timedelta(days=13)}")
print(f"CAMP4_END_DATE={today + timedelta(days=15)}")
PYEOF
)

# Valley campgrounds (6-month window) — Camp 4 excluded
ARGS=(
  --start-date "$START_DATE"
  --end-date "$END_DATE"
  --parks 232448 232450 232447 232449
)

# Full sweep — valley campgrounds only, today through 5 months
# --nights 1 required: without it, script requires sites available for the ENTIRE date range
FULL_ARGS=(
  --start-date "$FULL_START_DATE"
  --end-date "$FULL_END_DATE"
  --nights 1
  --parks 232448 232450 232447 232449
)

# Camp 4 (14-day window)
CAMP4_ARGS=(
  --start-date "$CAMP4_START_DATE"
  --end-date "$CAMP4_END_DATE"
  --parks 10004152
)
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/camping_cron.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/camping_cron.lock}"
MAX_RUNTIME_SECS=270  # kill if longer than interval minus buffer

# Source environment variables for email notification
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  source "$SCRIPT_DIR/.env"
fi

# --- Functions ---


log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

run_check() {
  local label="$1"
  shift 1
  local args=("$@")

  # Log to stderr so it doesn't get captured when caller does VAR=$(run_check ...)
  log "START $label: $PYTHON_BIN $CAMPING_PY ${args[*]}" >&2
  local output
  if command -v timeout >/dev/null 2>&1; then
    output=$(timeout "$MAX_RUNTIME_SECS" "$PYTHON_BIN" "$CAMPING_PY" "${args[@]}" 2>&1)
    RC=$?
  else
    output=$("$PYTHON_BIN" "$CAMPING_PY" "${args[@]}" 2>&1)
    RC=$?
  fi

  # Write to log file and stderr (terminal) only — not stdout (which caller captures)
  printf "%s\n" "$output" | tee -a "$LOG_FILE" >&2
  log "END $label (exit=$RC)" >&2

  # Only this goes to stdout for capture by the caller
  printf "%s" "$output"
}

# --- Lock to avoid overlapping runs ---
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "SKIP: previous run still active"
  exit 0
fi
trap 'rm -f "$LOCK_FILE"' EXIT

# --- Set up Python virtual environment ---
VENV_PATH="$SCRIPT_DIR/myvenv"
if [[ ! -d "$VENV_PATH" ]]; then
  echo "Creating Python virtual environment at $VENV_PATH..."
  python3 -m venv "$VENV_PATH"
fi
source "$VENV_PATH/bin/activate"

# Ensure required packages are installed
if ! python -c "import requests" &>/dev/null; then
  log "Installing required packages..."
  pip install --quiet -r "$SCRIPT_DIR/requirements.txt"
fi

# Run valley campgrounds (5-month release window)
VALLEY_OUTPUT=$(run_check "valley-campgrounds" "$START_DATE" "$END_DATE" "${ARGS[@]}")

# Run full cancellation sweep: today through 5 months (human-readable)
FULL_OUTPUT=$(run_check "full-sweep" "$FULL_START_DATE" "$FULL_END_DATE" "${FULL_ARGS[@]}")

# Also run the full sweep as JSON to generate the heatmap
log "Generating availability heatmap..." >&2
HEATMAP_PNG_PATH="/tmp/camping_heatmap_$$.png"
"$PYTHON_BIN" "$CAMPING_PY" --start-date "$FULL_START_DATE" --end-date "$FULL_END_DATE" \
  --nights 1 --parks 232448 232450 232447 232449 10004152 --json-output 2>/dev/null \
  | node "$SCRIPT_DIR/heatmap_screenshot.js" --output "$HEATMAP_PNG_PATH"
if [[ -f "$HEATMAP_PNG_PATH" ]]; then
  log "Heatmap generated: $HEATMAP_PNG_PATH" >&2
else
  log "WARNING: Heatmap generation failed — email will be sent without it" >&2
  HEATMAP_PNG_PATH=""
fi
export HEATMAP_PNG_PATH

# Run Camp 4 separately (~14-day window)
CAMP4_OUTPUT=$(run_check "camp4" "$CAMP4_START_DATE" "$CAMP4_END_DATE" "${CAMP4_ARGS[@]}")

# Combine results and send a single notification email
COMBINED_OUTPUT="--- Valley Campgrounds ($START_DATE to $END_DATE) ---
$VALLEY_OUTPUT

--- Full Window Sweep ($FULL_START_DATE to $FULL_END_DATE) ---
$FULL_OUTPUT

--- Camp 4 ($CAMP4_START_DATE to $CAMP4_END_DATE) ---
$CAMP4_OUTPUT"

if echo "$COMBINED_OUTPUT" | grep -q "🏕"; then
  log "Available campsites found! Sending notification..."
else
  log "No available campsites found. Sending notification anyway..."
fi

echo "$COMBINED_OUTPUT" | "$PYTHON_BIN" "$NOTIFIER_PY" 2>&1 | tee -a "$LOG_FILE"

# Clean up temp heatmap
[[ -n "$HEATMAP_PNG_PATH" && -f "$HEATMAP_PNG_PATH" ]] && rm -f "$HEATMAP_PNG_PATH"
