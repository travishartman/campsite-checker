# cron-job.org Setup (External Scheduler)

GitHub's built-in scheduled workflows are unreliable for low-traffic repos — runs can be skipped or delayed for hours. cron-job.org solves this by triggering the GitHub Actions `workflow_dispatch` event on a reliable external schedule.

---

## Step 1 — Create a GitHub Personal Access Token

1. Go to `github.com/settings/tokens` → **Tokens (classic)** → **Generate new token (classic)**
2. Set:
   - **Note**: `campsite-checker trigger`
   - **Expiration**: 90 days (or no expiration)
   - **Scope**: check only `workflow`
3. Click **Generate token** — copy it immediately (it won't show again)

---

## Step 2 — Create the cron-job.org job

1. Go to `console.cron-job.org` and sign up / log in
2. Click **Create cronjob** and fill in:

| Field | Value |
|---|---|
| Title | `Campsite Checker` |
| URL | `https://api.github.com/repos/YOUR_GITHUB_USERNAME/campsite-checker/actions/workflows/camping-checker.yml/dispatches` |
| Schedule | `0 15 * * *` (daily 7:00 AM PT / 15:00 UTC) |
| Request method | `POST` |

3. Under **Headers**, add:
   ```
   Accept: application/vnd.github+json
   Authorization: Bearer YOUR_PAT_HERE
   ```

4. Under **Request body**:
   ```json
   {"ref":"main"}
   ```

5. Save the job

---

## Step 3 — Verify it works

Click **Run now** in cron-job.org. A successful trigger returns HTTP `204 No Content`.

Then check `github.com/YOUR_GITHUB_USERNAME/campsite-checker/actions` — the workflow run should appear within a few seconds.

---

## Notes

- The PAT only needs the `workflow` scope — no other permissions required
- If the PAT expires, update the `Authorization` header in cron-job.org with a new token
- The GitHub scheduled cron (`0 15 * * *`) in the workflow file is kept as a backup but is not relied upon
