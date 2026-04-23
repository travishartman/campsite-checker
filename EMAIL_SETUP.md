# Email Notification Setup

This guide explains how to set up email notifications for campsite availability alerts.

## Configuration

The email configuration is stored in `.env` file with the following variables:

```bash
# Sender Gmail address
export GMAIL_EMAIL=your-sender@gmail.com

# Gmail app password (16-character app-specific password, NO spaces)
export GMAIL_PASSWORD=jskhevqepiamyuvc

# Recipient email address
export NOTIFY_EMAIL=your-recipient@gmail.com
```

> **Important:** Store the app password **without spaces**. Gmail displays it with spaces in the UI,
> but the password must be stored as a continuous 16-character string (e.g. `jskhevqepiamyuvc`).

## How It Works

1. **camping.py** runs and checks for campsite availability
2. If campsites are available (🏕 emoji in output), the script pipes output to **notifier.py**
3. **notifier.py** sends an email via Gmail SMTP to the configured recipient

## Testing Email Notifications

### Test 1: Send a test email
```bash
./test_notification.sh
```

This will send a test email to verify your Gmail credentials are working.

### Test 2: Run the full check manually
```bash
source .env
./camping_cron.sh
```

This runs the campsite checker and will send an email if sites are available.

## Gmail App Password Setup

**Important:** You need a Gmail App Password, not your regular Gmail password.

1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to Security → 2-Step Verification (enable if not already)
3. Scroll down to "App passwords"
4. Generate a new app password for "Mail" on "Mac" (or other device)
5. Copy the 16-character password (no spaces) into `.env` as `GMAIL_PASSWORD`

## Automated Checking with Cron

The `camping_cron.sh` script:
- Runs every 5 minutes (when set up in crontab)
- Activates the Python virtual environment
- Sources email credentials from `.env`
- Runs the campsite checker
- Sends email notification if campsites are available
- Logs all output to `camping_cron.log`

### To set up the cron job:

```bash
crontab -e
```

Add this line (adjust path as needed):
```
*/5 * * * * /Users/travishartman/Desktop/dev/recreation-gov-campsite-checker/camping_cron.sh
```

### Monitor the logs:
```bash
tail -f camping_cron.log
```

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
