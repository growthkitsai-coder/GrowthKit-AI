/**
 * GrowthKit waitlist receiver — Google Apps Script.
 *
 * One-time setup:
 *   1. Go to https://sheets.new and create a new Google Sheet
 *      (e.g. name it "GrowthKit Waitlist").
 *   2. In that sheet: Extensions → Apps Script.
 *   3. Delete whatever is in Code.gs and paste this file's contents in. Save.
 *   4. Click "Deploy" → "New deployment".
 *        Type:           Web app
 *        Execute as:     Me (your account)
 *        Who has access: Anyone
 *      Authorize when prompted (first run also asks for Mail permission —
 *      that's the confirmation email).
 *   5. Copy the "Web app URL" it gives you.
 *   6. Paste that URL into the SCRIPT_URL constant in BOTH waitlist.html
 *      (form submit) and status.html (health check).
 *
 * Re-deploying after edits:
 *   Use "Manage deployments" → pencil icon → Version: New version → Deploy.
 *   The web app URL stays the same. (Choosing "New deployment" gives you a NEW
 *   URL and you'd have to update waitlist.html AND status.html again.)
 *
 * NOTE: editing this file in the repo does nothing by itself — the deployed
 * copy lives in Google's cloud. After changing this file, paste the new
 * contents into the Apps Script editor and redeploy as described above.
 *
 * Hardening (added 2026-06-10):
 *   - Honeypot: the form includes a hidden "company" field humans never see.
 *     If it arrives filled, the request is dropped but still answered with
 *     { ok: true } so bots don't learn they were caught.
 *   - Minimum fill time: the form sends "t" = milliseconds between page load
 *     and submit. Under 2.5 seconds → dropped the same silent way.
 *   - Server-side validation: name and email are checked here too, not just
 *     in the browser — anyone can POST to this URL directly.
 *   - Dedupe: an email already on the sheet updates that row's timestamp and
 *     consent instead of appending a second row (consent is never downgraded).
 *   - Soft rate limit: more than RATE_LIMIT_MAX accepted signups per
 *     RATE_LIMIT_WINDOW_SEC gets a polite "try again in a few minutes" —
 *     visible failure, so a real launch-day spike is never silently lost.
 *   - Confirmation email: brand-new signups get a short note via MailApp.
 *     Failures there never block the signup (quota guard + try/catch).
 */

var CONFIG = {
  MIN_SUBMIT_MS: 2500,        // human floor: faster than this = bot
  RATE_LIMIT_MAX: 60,         // accepted signups per window before backpressure
  RATE_LIMIT_WINDOW_SEC: 600, // 10 minutes
  REPLY_TO: 'info@growthkitai.com',
  SENDER_NAME: 'GrowthKit AI'
};

function doPost(e) {
  try {
    var params = (e && e.parameter) || {};

    // Honeypot + minimum fill time — drop silently, report success.
    if (params.company) return json_({ ok: true });
    var elapsed = parseInt(params.t, 10);
    if (!isNaN(elapsed) && elapsed >= 0 && elapsed < CONFIG.MIN_SUBMIT_MS) {
      return json_({ ok: true });
    }

    // Server-side validation (the browser check is advisory only).
    var name = String(params.name || '').trim().slice(0, 120);
    var email = String(params.email || '').trim().toLowerCase().slice(0, 254);
    var wantsUpdates = params.updates === 'true';
    if (!name) return json_({ ok: false, error: 'Name is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json_({ ok: false, error: 'That email address does not look right.' });
    }

    // Soft rate limit — visible failure, so real users can retry.
    var cache = CacheService.getScriptCache();
    var hits = parseInt(cache.get('gk-rate') || '0', 10);
    if (hits >= CONFIG.RATE_LIMIT_MAX) {
      return json_({ ok: false, error: 'We are getting a lot of signups right now — please try again in a few minutes.' });
    }

    var isNew = false;
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Timestamp', 'Name', 'Email', 'Wants updates']);
      }

      // Dedupe by email (case-insensitive), column C.
      var lastRow = sheet.getLastRow();
      var existingRow = 0;
      if (lastRow >= 2) {
        var emails = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
        for (var i = 0; i < emails.length; i++) {
          if (String(emails[i][0]).trim().toLowerCase() === email) {
            existingRow = i + 2;
            break;
          }
        }
      }

      if (existingRow) {
        sheet.getRange(existingRow, 1).setValue(new Date());
        sheet.getRange(existingRow, 2).setValue(name);
        // Never downgrade consent: only flip No → Yes.
        if (wantsUpdates) sheet.getRange(existingRow, 4).setValue('Yes');
      } else {
        sheet.appendRow([new Date(), name, email, wantsUpdates ? 'Yes' : 'No']);
        isNew = true;
      }
    } finally {
      lock.releaseLock();
    }

    if (isNew) {
      cache.put('gk-rate', String(hits + 1), CONFIG.RATE_LIMIT_WINDOW_SEC);
      sendConfirmation_(name, email, wantsUpdates);
    }
    return json_({ ok: true, duplicate: !isNew });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Short confirmation note to a brand-new signup. Never blocks the signup. */
function sendConfirmation_(name, email, wantsUpdates) {
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    var first = name.split(' ')[0] || 'there';
    var lines = [
      'Hi ' + first + ',',
      '',
      "You're on the GrowthKit AI waitlist — logged, stamped, and in the queue.",
      '',
      'When your spot opens, a founder (not a form) will reply from this address with access details.',
      wantsUpdates
        ? "In the meantime we'll send occasional product updates and market-intel notes. Reply \"unsubscribe\" any time to stop them."
        : "We'll only email you about your spot — no newsletters, since you didn't ask for them.",
      '',
      'Markets, dissected — not guessed.',
      '',
      '— Avi',
      'GrowthKit AI · London · https://growthkitai.com'
    ];
    MailApp.sendEmail({
      to: email,
      subject: "You're on the list — GrowthKit AI",
      name: CONFIG.SENDER_NAME,
      replyTo: CONFIG.REPLY_TO,
      body: lines.join('\n')
    });
  } catch (e) {
    // Mail problems must never fail the signup.
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var count = 0;
    // Skip row 1 — it's the header that doPost writes on first signup.
    if (lastRow >= 2 && lastCol >= 1) {
      var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        for (var j = 0; j < row.length; j++) {
          var cell = row[j];
          if (cell !== '' && cell !== null && cell !== undefined && String(cell).trim() !== '') {
            count++;
            break;
          }
        }
      }
    }
    return json_({ ok: true, count: count });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
