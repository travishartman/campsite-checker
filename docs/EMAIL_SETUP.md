# Email Notification Setup

This guide explains how to configure email notifications for campsite availability alerts.

## Configuration

Credentials are passed as **GitHub Actions repository secrets** (never stored in the repo).

Add the following secrets at: `https://github.com/YOUR_GITHUB_USERNAME/campsite-checker/settings/secrets/actions`

| Secret | Description |
|---|---|
| `GMAIL_EMAIL` | Gmail address used to send notifications |
| `GMAIL_PASSWORD` | Gmail App Password (16 characters, see below) |
| `NOTIFY_EMAIL` | Email address to receive notifications |

> For local runs only: copy `.env.example` to `.env` and fill in the values. `.env` is gitignored.

## How It Works

1. **camping_cron.sh** runs three availability sweeps via `camping.py`
2. Results are combined and piped to **notifier.py**
3. **notifier.py** sends an HTML email via Gmail SMTP with:
   - Available campgrounds with **Book now** links
   - 6-month calendar heatmap embedded inline
   - Full check output for reference

## Gmail App Password Setup

**Important:** You need a Gmail App Password, not your regular Gmail password.

1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to **Security → 2-Step Verification** (enable if not already)
3. Scroll down to **App passwords**
4. Generate a new app password for "Mail"
5. Copy the 16-character password into the `GMAIL_PASSWORD` secret

> Spaces in the displayed password are stripped automatically — paste it exactly as shown.

## Testing Locally

```bash
cp .env.example .env
# Fill in .env with your credentials
source .env
bash camping_cron.sh
```

Or to send a quick test email only:
```bash
source .env && bash test_notification.sh
```

## Monitoring

Run history and logs are available in the GitHub Actions tab:
`https://github.com/YOUR_GITHUB_USERNAME/campsite-checker/actions`


## Customizing Search Parameters

Edit the `ARGS` array in `camping_cron.sh`:

```bash
ARGS=(
  --start-date 2025-10-07    # Start date (YYYY-MM-DD)
  --end-date 2025-10-24      # End date (YYYY-MM-DD)
  --nights 3                 # Number of consecutive nights
  --parks 232448 232450      # Park IDs (space-separated)
)
```

## Troubleshooting

### No email received
1. Check Gmail app password is correct
2. Verify 2-Step Verification is enabled on Google Account
3. Check spam/junk folder
4. Run `./test_notification.sh` to test credentials

### Permission denied
```bash
chmod +x camping_cron.sh test_notification.sh
```

### Python packages missing
```bash
source myvenv/bin/activate
pip install -r requirements.txt
```

### Check cron is running
```bash
grep CRON /var/log/system.log  # macOS
# or check camping_cron.log for entries
```

## Security Note

⚠️ **The `.env` file contains sensitive credentials and should not be committed to git.**

Add to `.gitignore`:
```
.env
camping_cron.log
```
