const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Updates are signed with an offline Ed25519 key (build/sign-update.cjs). The
// signature travels in latest.yml as `metechSignature`; without the private
// key, a compromised release account cannot produce an installable update.
const APP_ID = 'com.metech.bear.desktop.assistant';
const PUBLIC_KEY_FILE = path.join(__dirname, 'update-signing-public-key.pem');

function signedUpdateMessage({ version, file, sha512 }) {
  for (const value of [version, file, sha512]) {
    if (typeof value !== 'string' || !value || /[\r\n]/.test(value)) throw new Error('Update metadata is incomplete.');
  }
  return Buffer.from(['METech-update-v1', APP_ID, version, file, sha512].join('\n'), 'utf8');
}

function sha512File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    fs.createReadStream(file).on('error', reject).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('base64')));
  });
}

async function verifyDownloadedUpdate(info, publicKey = fs.readFileSync(PUBLIC_KEY_FILE, 'utf8')) {
  const file = info?.path;
  if (!file || info.files?.[0]?.url !== file) throw new Error('Update metadata is inconsistent.');
  if (typeof info.metechSignature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(info.metechSignature)) {
    throw new Error('Update is not signed by METech.');
  }
  const sha512 = await sha512File(info.downloadedFile);
  if (sha512 !== info.sha512 || (info.files[0].sha512 && info.files[0].sha512 !== sha512)) {
    throw new Error('Downloaded update does not match its metadata.');
  }
  const message = signedUpdateMessage({ version: String(info.version || ''), file, sha512 });
  if (!crypto.verify(null, message, publicKey, Buffer.from(info.metechSignature, 'base64'))) {
    throw new Error('Update signature is invalid.');
  }
  return true;
}

module.exports = { APP_ID, PUBLIC_KEY_FILE, signedUpdateMessage, sha512File, verifyDownloadedUpdate };
