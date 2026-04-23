import sys
import re
import signal
signal.signal(signal.SIGPIPE, signal.SIG_DFL)
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from enums.emoji import Emoji

# Configure email credentials via environment variables (see EMAIL_SETUP.md):
#   GMAIL_EMAIL    - sender Gmail address
#   GMAIL_PASSWORD - Gmail app password (no spaces)
#   NOTIFY_EMAIL   - recipient email address

def send_email_gmail(to_email, subject, text_body, html_body=None, image_path=None):
    from_email = os.environ.get('GMAIL_EMAIL')
    smtp_server = 'smtp.gmail.com'
    smtp_port = 587
    smtp_user = from_email
    # Strip spaces in case the app password was stored with display spaces
    smtp_password = (os.environ.get('GMAIL_PASSWORD') or '').replace(' ', '')

    # Build multipart/related so inline image CID works in HTML
    msg = MIMEMultipart('related')
    msg['Subject'] = subject
    msg['From'] = from_email
    msg['To'] = to_email

    alt = MIMEMultipart('alternative')
    msg.attach(alt)
    alt.attach(MIMEText(text_body, 'plain'))
    if html_body:
        alt.attach(MIMEText(html_body, 'html'))

    if image_path and os.path.isfile(image_path):
        with open(image_path, 'rb') as f:
            img = MIMEImage(f.read())
        img.add_header('Content-ID', '<heatmap>')
        img.add_header('Content-Disposition', 'inline', filename='heatmap.png')
        msg.attach(img)

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(from_email, [to_email], msg.as_string())
    except smtplib.SMTPAuthenticationError:
        print("SMTP authentication failed. Check GMAIL_EMAIL and GMAIL_PASSWORD.")
        raise
    except smtplib.SMTPException as e:
        print(f"SMTP error sending email: {e}")
        raise

def generate_availability_strings(lines, start_date=None, end_date=None):
    """Return a list of dicts describing each available campground."""
    results = []
    for line in lines:
        line = line.strip()
        if Emoji.SUCCESS.value not in line:
            continue
        park_info = line.split(":")[0].split(" ")[1:]
        park_id = None
        park_name_parts = []
        for part in park_info:
            if part.startswith("(") and part.endswith(")"):
                park_id = part[1:-1]
            else:
                park_name_parts.append(part)
        if not park_id:
            continue
        park_name = " ".join(park_name_parts)
        num_available = line.split(":")[1].strip().split(" ")[0]

        base = f"https://www.recreation.gov/camping/campgrounds/{park_id}"
        if start_date and end_date:
            book_url = (
                f"{base}/availability"
                f"?campsite_type_of_use=Overnight"
                f"&start_date={start_date}T00%3A00%3A00.000Z"
                f"&end_date={end_date}T00%3A00%3A00.000Z"
            )
        else:
            book_url = base

        results.append({
            'name': park_name,
            'num': num_available,
            'book_url': book_url,
            'page_url': base,
        })
    return results

def main(args, stdin):
    # Send a test notification if TEST_NOTIFY environment variable is set
    if os.environ.get('TEST_NOTIFY') == '1':
        to_email = os.environ.get('NOTIFY_EMAIL')
        subject = 'Test Notification'
        body = 'This is a test notification from the campsite checker.'
        print(f"Sending test notification to {to_email}...")
        if to_email:
            send_email_gmail(to_email, subject, body)
            print(f"Test email sent to {to_email}")
        else:
            print("No NOTIFY_EMAIL set. Test notification not sent.")
        # Unset TEST_NOTIFY so only one test is sent
        os.environ['TEST_NOTIFY'] = '0'
        sys.exit(0)

    # Safely read all lines from stdin; exit early if no input
    all_lines = list(stdin)
    if not all_lines:
        print("No input received from camping.py. Nothing to send.")
        sys.exit(0)

    # Parse sections by header "--- Label (START to END) ---" to extract dates per section
    sections = []
    current = {'start': None, 'end': None, 'lines': []}
    header_re = re.compile(r'--- .+? \((\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\) ---')
    for line in all_lines:
        m = header_re.search(line)
        if m:
            if current['lines']:
                sections.append(current)
            current = {'start': m.group(1), 'end': m.group(2), 'lines': [line]}
        else:
            current['lines'].append(line)
    if current['lines']:
        sections.append(current)

    # Collect available site dicts from each section using its own date range
    available_sites = []
    for section in sections:
        available_sites.extend(
            generate_availability_strings(section['lines'], section['start'], section['end'])
        )

    # Build plain-text and HTML representations
    available_site_strings = [
        f"AVAILABLE: {s['num']} site(s) at {s['name']}\n"
        f"  Book now: {s['book_url']}\n"
        f"  Campground page: {s['page_url']}"
        for s in available_sites
    ]

    print(f"Available site strings: {available_site_strings}")

    to_email = os.environ.get('NOTIFY_EMAIL')
    heatmap_path = os.environ.get('HEATMAP_PNG_PATH')

    # ── Plain-text body ──────────────────────────────────────────────────────
    full_output = "".join(all_lines)

    if available_site_strings:
        subject = 'Campsite Available!'
        booking_section = "\n\n" + "=" * 40 + "\nBOOK NOW\n" + "=" * 40 + "\n"
        booking_section += "\n\n".join(available_site_strings)
        text_body = f"{full_output}{booking_section}"
    else:
        subject = 'Campsite Check - No Availability'
        text_body = f"{full_output}\nNo campsites currently available. Will keep checking."

    # ── HTML body ────────────────────────────────────────────────────────────
    safe_output = full_output.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    heatmap_html = '<p><img src="cid:heatmap" alt="Campsite Availability Heatmap" style="max-width:100%;border-radius:6px;"></p>' if heatmap_path else ''

    if available_sites:
        booking_rows = "".join(
            f'<tr>'
            f'<td style="padding:10px 0;border-bottom:1px solid #eee;">'
            f'<span style="font-size:14px;font-weight:600;color:#24292e;">'
            f'{s["num"]} sites available at {s["name"]}'
            f'</span><br>'
            f'<a href="{s["book_url"]}" style="color:#3498db;text-decoration:none;font-size:13px;">Book now</a>'
            f'&nbsp;&nbsp;|&nbsp;&nbsp;'
            f'<a href="{s["page_url"]}" style="color:#888;text-decoration:none;font-size:13px;">Campground page</a>'
            f'</td>'
            f'</tr>'
            for s in available_sites
        )
        booking_html = f"""
        <h2 style="color:#e74c3c;">&#127957; Book Now</h2>
        <table style="width:100%;border-collapse:collapse;">{booking_rows}</table>
        """
    else:
        booking_html = '<p style="color:#888;">No campsites currently available. Will keep checking.</p>'

    html_body = f"""
    <html><body style="font-family:Arial,sans-serif;max-width:900px;margin:auto;padding:16px;color:#333;">
      <h1 style="font-size:20px;border-bottom:2px solid #3498db;padding-bottom:8px;">{subject}</h1>
      {heatmap_html}
      {booking_html}
      <hr style="margin:24px 0;border:none;border-top:1px solid #eee;">
      <h3 style="color:#555;">Full Check Output</h3>
      <pre style="background:#f8f9fa;padding:12px;border-radius:4px;font-size:12px;overflow-x:auto;">{safe_output}</pre>
    </body></html>
    """

    print(f"Sending notification to {to_email}...")
    if to_email:
        send_email_gmail(to_email, subject, text_body, html_body=html_body, image_path=heatmap_path)
        print(f"Email sent to {to_email}")
    else:
        print("No NOTIFY_EMAIL set. Notification not sent.")
    sys.exit(0)

if __name__ == "__main__":
    main(sys.argv, sys.stdin)
