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
 *      Authorize when prompted.
 *   5. Copy the "Web app URL" it gives you.
 *   6. Open waitlist.html and paste that URL into the SCRIPT_URL constant near
 *      the top of the <script> block.
 *
 * Re-deploying after edits:
 *   Use "Manage deployments" → pencil icon → Version: New version → Deploy.
 *   The web app URL stays the same. (Choosing "New deployment" gives you a NEW
 *   URL and you'd have to update waitlist.html again.)
 */

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Name', 'Email', 'Wants updates']);
    }
    const params = (e && e.parameter) || {};
    sheet.appendRow([
      new Date(),
      params.name || '',
      params.email || '',
      params.updates === 'true' ? 'Yes' : 'No'
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    let count = 0;
    // Skip row 1 — it's the header that doPost writes on first signup.
    if (lastRow >= 2 && lastCol >= 1) {
      const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        for (let j = 0; j < row.length; j++) {
          const cell = row[j];
          if (cell !== '' && cell !== null && cell !== undefined && String(cell).trim() !== '') {
            count++;
            break;
          }
        }
      }
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, count: count }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
