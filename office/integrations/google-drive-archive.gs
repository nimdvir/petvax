/**
 * PetVax Office → Google Drive archive.
 *
 * Runs as the Google account that deploys it (use petvaxnyc@gmail.com, which can edit the "PetVax" folder).
 * PetVax Office POSTs each new form-submission PDF and certificate PDF here; this script saves it into
 *   PetVax/PetVax Office archive/Form submissions/<year>/<year-month>/...
 *   PetVax/PetVax Office archive/Certificates/<year>/<year-month>/...
 * and appends one line per file to PetVax/PetVax Office archive/index.csv.
 *
 * Setup (once): see docs/GOOGLE_DRIVE.md. Script property ARCHIVE_SECRET must match DRIVE_ARCHIVE_SECRET in Vercel.
 */
var ROOT_FOLDER_ID = '1F8Yr7c-dYeVFyycTtc1XtbGpj6OZ1tSV'; // the "PetVax" Drive folder
var ARCHIVE_FOLDER_NAME = 'PetVax Office archive';
var CSV_NAME = 'index.csv';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('ARCHIVE_SECRET');
    if (!secret || body.secret !== secret) return reply({ ok: false, error: 'Not authorized' });
    if (!body.fileName || !body.base64 || !body.folderPath) return reply({ ok: false, error: 'Missing file' });

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var archive = childFolder(DriveApp.getFolderById(ROOT_FOLDER_ID), ARCHIVE_FOLDER_NAME);
      var folder = archive;
      for (var i = 0; i < body.folderPath.length; i++) folder = childFolder(folder, String(body.folderPath[i]));

      // Saving the same record twice never creates a duplicate file or CSV line.
      var existing = folder.getFilesByName(body.fileName);
      if (existing.hasNext()) return reply({ ok: true, url: existing.next().getUrl(), duplicate: true });

      var blob = Utilities.newBlob(Utilities.base64Decode(body.base64), body.mimeType || 'application/pdf', body.fileName);
      var file = folder.createFile(blob);
      appendCsv(archive, body.csvHeaders || [], (body.csvRow || []).concat([file.getUrl()]));
      return reply({ ok: true, url: file.getUrl() });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
}

/** Visiting the web app URL in a browser shows that it is running (no data is returned). */
function doGet() {
  return reply({ ok: true, service: 'PetVax Office Drive archive' });
}

function childFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function csvCell(v) {
  var s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function appendCsv(folder, headers, row) {
  var line = row.map(csvCell).join(',') + '\r\n';
  var it = folder.getFilesByName(CSV_NAME);
  if (!it.hasNext()) {
    folder.createFile(CSV_NAME, headers.concat(['Drive file']).map(csvCell).join(',') + '\r\n' + line, MimeType.CSV);
    return;
  }
  var file = it.next();
  file.setContent(file.getBlob().getDataAsString() + line);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
