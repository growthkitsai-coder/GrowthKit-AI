/**
 * GrowthKit client-onboarding receiver — Google Apps Script.
 *
 * This is the SECOND Apps Script in the stack — completely separate from the
 * waitlist one. It feeds the engine: structured client briefs (company,
 * market, competitors, ICP) land in their own Google Sheet, which is the
 * input the deliverable pipeline (clients/<client>.json) is built from.
 *
 * One-time setup (same proven pattern as the waitlist):
 *   1. Go to https://sheets.new and create a new Google Sheet
 *      (e.g. name it "GrowthKit Client Briefs"). Do NOT reuse the waitlist
 *      sheet — different columns, different lifecycle.
 *   2. In that sheet: Extensions → Apps Script.
 *   3. Delete whatever is in Code.gs and paste this file's contents in. Save.
 *   4. Click "Deploy" → "New deployment".
 *        Type:           Web app
 *        Execute as:     Me (your account)
 *        Who has access: Anyone
 *      Authorize when prompted (first run also asks for Mail permission —
 *      that's the confirmation email).
 *   5. Copy the "Web app URL" it gives you.
 *   6. Paste that URL into the SCRIPT_URL constant in onboarding.html
 *      (near the top of the page's inline <script> block).
 *
 * Re-deploying after edits:
 *   "Manage deployments" → pencil icon → Version: New version → Deploy.
 *   The web app URL stays the same. ("New deployment" = NEW URL = broken
 *   form until onboarding.html is updated.)
 *
 * NOTE: editing this file in the repo does nothing by itself — the deployed
 * copy lives in Google's cloud. After changing this file, paste the new
 * contents into the Apps Script editor and redeploy as described above.
 *
 * Hardening (mirrors waitlist-apps-script.gs):
 *   - Honeypot: the form's hidden "fax" field. (The waitlist uses "company"
 *     as its honeypot — onboarding has a REAL company field, hence "fax".)
 *     Filled honeypot → dropped but answered { ok: true } so bots learn nothing.
 *   - Minimum fill time: "t" = ms between page load and submit. A real brief
 *     takes minutes; under 20 seconds → dropped the same silent way.
 *   - Server-side validation of every required field — anyone can POST here.
 *   - Dedupe: same email + same company updates the existing row (a founder
 *     revising their brief) instead of appending a duplicate.
 *   - Soft rate limit: briefs are low-volume by nature; more than
 *     RATE_LIMIT_MAX accepted per window is bot weather — visible failure.
 *   - Confirmation email to new briefs via MailApp (never blocks the save).
 */

var CONFIG = {
  MIN_SUBMIT_MS: 20000,       // a real brief takes minutes; <20s = bot
  RATE_LIMIT_MAX: 10,         // accepted briefs per window before backpressure
  RATE_LIMIT_WINDOW_SEC: 600, // 10 minutes
  REPLY_TO: 'info@growthkitai.com',
  SENDER_NAME: 'GrowthKit AI'
};

var HEADERS = ['Timestamp', 'Company', 'Website', 'Contact name', 'Email', 'Stage', 'Market', 'Competitors', 'ICP', 'Notes'];

function doPost(e) {
  try {
    var params = (e && e.parameter) || {};

    // Honeypot + minimum fill time — drop silently, report success.
    if (params.fax) return json_({ ok: true });
    var elapsed = parseInt(params.t, 10);
    if (!isNaN(elapsed) && elapsed >= 0 && elapsed < CONFIG.MIN_SUBMIT_MS) {
      return json_({ ok: true });
    }

    // Server-side validation (the browser check is advisory only).
    var company = String(params.companyName || '').trim().slice(0, 200);
    var website = String(params.website || '').trim().slice(0, 300);
    var contact = String(params.contactName || '').trim().slice(0, 120);
    var email = String(params.email || '').trim().toLowerCase().slice(0, 254);
    var stage = String(params.stage || '').trim().slice(0, 40);
    var market = String(params.market || '').trim().slice(0, 4000);
    var competitors = String(params.competitors || '').trim().slice(0, 4000);
    var icp = String(params.icp || '').trim().slice(0, 4000);
    var notes = String(params.notes || '').trim().slice(0, 4000);

    if (!company) return json_({ ok: false, error: 'Company name is required.' });
    if (!website) return json_({ ok: false, error: 'Website is required.' });
    if (!contact) return json_({ ok: false, error: 'Contact name is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json_({ ok: false, error: 'That email address does not look right.' });
    }
    if (!stage) return json_({ ok: false, error: 'Stage is required.' });
    if (!market) return json_({ ok: false, error: 'The market description is required.' });
    if (!icp) return json_({ ok: false, error: 'The ideal-customer description is required.' });

    // Soft rate limit — visible failure, so real clients can retry.
    var cache = CacheService.getScriptCache();
    var hits = parseInt(cache.get('gk-onb-rate') || '0', 10);
    if (hits >= CONFIG.RATE_LIMIT_MAX) {
      return json_({ ok: false, error: 'We are receiving a lot of briefs right now — please try again in a few minutes.' });
    }

    var isNew = false;
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(HEADERS);
      }

      // Dedupe by email + company: a founder revising their brief updates
      // the existing row rather than appending a duplicate.
      var lastRow = sheet.getLastRow();
      var existingRow = 0;
      if (lastRow >= 2) {
        var rows = sheet.getRange(2, 2, lastRow - 1, 4).getValues(); // Company .. Email
        for (var i = 0; i < rows.length; i++) {
          var rowCompany = String(rows[i][0]).trim().toLowerCase();
          var rowEmail = String(rows[i][3]).trim().toLowerCase();
          if (rowEmail === email && rowCompany === company.toLowerCase()) {
            existingRow = i + 2;
            break;
          }
        }
      }

      var rowValues = [new Date(), company, website, contact, email, stage, market, competitors, icp, notes];
      if (existingRow) {
        sheet.getRange(existingRow, 1, 1, HEADERS.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
        isNew = true;
      }
    } finally {
      lock.releaseLock();
    }

    if (isNew) {
      cache.put('gk-onb-rate', String(hits + 1), CONFIG.RATE_LIMIT_WINDOW_SEC);
      sendConfirmation_(contact, email, company);
    }
    return json_({ ok: true, duplicate: !isNew });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Confirmation note for a freshly received brief. Never blocks the save. */
function sendConfirmation_(contact, email, company) {
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    var first = contact.split(' ')[0] || 'there';
    var lines = [
      'Hi ' + first + ',',
      '',
      'Your brief for ' + company + ' just landed — the engine starts on your market today.',
      '',
      'What happens next:',
      '  1. The system maps your market, dissects the field, and drafts the four deliverables.',
      '  2. An operator reviews the synthesis before anything reaches you.',
      '  3. Your first deliverable lands in this inbox within the week, at a private link.',
      '',
      'Forgot something, or want to sharpen the brief? Just reply to this email — it goes to a founder.',
      '',
      'Markets, dissected — not guessed.',
      '',
      '— Avi',
      'GrowthKit AI · London · https://growthkitai.com'
    ];
    MailApp.sendEmail({
      to: email,
      subject: 'Brief received — the engine is running · GrowthKit AI',
      name: CONFIG.SENDER_NAME,
      replyTo: CONFIG.REPLY_TO,
      body: lines.join('\n')
    });
  } catch (e) {
    // Mail problems must never fail the brief.
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Health check: returns the number of briefs on file. */
function doGet() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    var count = lastRow >= 2 ? lastRow - 1 : 0;
    return json_({ ok: true, count: count });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
