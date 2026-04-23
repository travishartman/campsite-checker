# Fork Updates

This project is a fork of [banool/recreation-gov-campsite-checker](https://github.com/banool/recreation-gov-campsite-checker), which itself was derived from [bri-bri/yosemite-camping](https://github.com/bri-bri/yosemite-camping).

The core availability-checking logic in `camping.py`, `clients/recreation_client.py`, and `utils/` originates from the upstream project. All additions and changes are described below.

---

## Notification: Twitter → Email

The original project used Twitter's API to send DM notifications. Twitter's API became paid/restricted, making this impractical.

**Replaced with:** Gmail SMTP via `notifier.py`. Credentials are stored in `.env` as `GMAIL_EMAIL`, `GMAIL_PASSWORD` (app password), and `NOTIFY_EMAIL`.

---

## HTML Email with Booking Links

Plain-text output is now sent as a rich HTML email containing:

- **Book Now section** — each available campground listed with site count, a pre-filled booking deep link, and a campground page link
- **Calendar heatmap** — a GitHub contribution-style 6-month availability calendar embedded inline as a PNG
- **Full check output** — the raw text output from all sweeps, appended for reference

---

## Calendar Heatmap (`heatmap_screenshot.js`)

A Node.js script using Playwright + Chromium renders a calendar heatmap and saves it as a PNG:

- 6-month grid (week columns × Mon–Sun rows)
- Each park has a distinct color; available days show the park color with the date number in white
- Unavailable days show light grey with the date number in dark grey
- Cell sizes scale dynamically to fill the full image width
- Generated headlessly at runtime, embedded in each email, then deleted

**Dependencies:** Node.js 18+, `playwright` npm package, Chromium (installed via `npx playwright install chromium`)

---

## `camping_cron.sh` Orchestrator

Replaces the original manual/crontab approach with a self-contained orchestration script that runs three checks per execution:

| Sweep | Parks | Date Window | Purpose |
|---|---|---|---|
| Valley release | Tuolumne, Lower/Upper/North Pines | 5 months ±1 day | Catches new reservations opening |
| Full sweep | Same 4 valley parks | Today → 5 months, `--nights 1` | Catches cancellations on any date |
| Camp 4 | Camp 4 (10004152) | +13 to +15 days | Separate 14-day rolling window |

All three outputs are combined into a single email per run.

**Key fix:** Without `--nights 1`, the script requires a site to be available for the *entire* date range — effectively returning 0 results always on long sweeps. The full sweep explicitly sets `--nights 1`.

---

## Cross-Platform Date Computation

BSD `date -v` (macOS-only) was replaced with Python's `datetime` + `python-dateutil` for all date arithmetic. The script now runs identically on macOS and Linux (GitHub Actions compatible).

---

## Scheduling: LaunchAgent (macOS)

A `com.travishartman.camping-checker.plist` LaunchAgent runs `camping_cron.sh` daily at 7:00 AM PT, replacing the original crontab approach. Logs to `camping_cron.log`.

---

## Removed

- **Twitter notification** — `python-twitter`, `oauthlib`, `requests-oauthlib`, `fake_twitter_credentials.json` all removed
- **Root-level virtualenv** — orphaned `bin/`, `lib/`, `include/`, `pyvenv.cfg` deleted; `myvenv/` is the canonical virtualenv
- **`heatmap_generator.py`** — matplotlib-based heatmap replaced by `heatmap_screenshot.js`
- **`camping_cron_setup.py`** — superseded by LaunchAgent plist
- **Unused dependencies** — `requirements.txt` trimmed from 17 packages to 3: `requests`, `python-dateutil`, `user_agent`

---

## Security

- `.env` added to `.gitignore` — credentials never committed
- `.env.example` provided as a template
- No credentials hardcoded anywhere in source
