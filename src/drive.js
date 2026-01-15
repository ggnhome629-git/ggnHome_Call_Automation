const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const STATE_FILE = path.join(__dirname, '..', 'data', 'drive_state.json');

/* ================================
   GOOGLE DRIVE AUTH
================================ */
const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

auth.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: 'v3', auth });

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

/* ================================
   HELPERS
================================ */
function isTextFile(file) {
  return file.name.toLowerCase().endsWith('.txt');
}

function isAudioFile(file) {
  if (!file || !file.name) return false;

  // skip hidden/system files like .props, .nomedia
  if (file.name.startsWith('.')) return false;

  // allow only common audio extensions
  return /\.(mp3|wav|m4a|aac|amr)$/i.test(file.name);
}

function loadLastProcessedTime() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return data.lastProcessedTime || null;
  } catch (e) {
    return null;
  }
}

function saveLastProcessedTime(time) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ lastProcessedTime: time }, null, 2)
  );
}

function extractPhoneFromFilename(filename) {
  if (!filename) return null;

  // Match numbers after "__" and take last 10 digits (handles country code)
  const match = filename.match(/__([0-9]{10,15})/);
  if (!match) return null;

  const raw = match[1];
  return raw.slice(-10); // keep last 10 digits as mobile number
}

/* ================================
   LIST FILES
================================ */
async function listFiles() {
  const lastProcessedTime = loadLastProcessedTime();

  let query = `'${DRIVE_FOLDER_ID}' in parents and trashed = false`;
  if (lastProcessedTime) {
    query += ` and createdTime > '${lastProcessedTime}'`;
  }

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name, mimeType, size, createdTime)',
    orderBy: 'createdTime',
  });

  const files = res.data.files || [];

  if (files.length > 0) {
    const newestTime = files[files.length - 1].createdTime;
    saveLastProcessedTime(newestTime);
  }

  return files.map(file => ({
    ...file,
    extractedPhone: extractPhoneFromFilename(file.name),
  }));
}

/* ================================
   DOWNLOAD FILE
================================ */
async function downloadFile(file) {
  const destPath = path.join(__dirname, '..', 'data', 'audio', file.name);
  const dest = fs.createWriteStream(destPath);

  const res = await drive.files.get(
    { fileId: file.id, alt: 'media' },
    { responseType: 'stream' }
  );

  await new Promise((resolve, reject) => {
    res.data
      .on('end', resolve)
      .on('error', reject)
      .pipe(dest);
  });

  return destPath;
}

module.exports = {
  listFiles,
  downloadFile,
  isTextFile,
  isAudioFile,
};