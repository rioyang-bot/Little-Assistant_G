// Signs the current installer and records the signature in release/latest.yml.
// Run after `electron-builder` (npm run dist does this). Needs the offline
// private key: METECH_UPDATE_SIGNING_KEY or ~/METech-update-signing/update-signing-private.pem.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { signedUpdateMessage, sha512File, verifyDownloadedUpdate } = require('../electron/update-signature.cjs');

async function signUpdate({ workspace = path.resolve(__dirname, '..'), keyFile, publicKey } = {}) {
  const privateKeyFile = path.resolve(keyFile || process.env.METECH_UPDATE_SIGNING_KEY
    || path.join(os.homedir(), 'METech-update-signing', 'update-signing-private.pem'));
  const relative = path.relative(workspace, privateKeyFile);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Refusing to use a private key stored inside the repository.');
  if (!fs.existsSync(privateKeyFile)) throw new Error(`Update signing key not found: ${privateKeyFile}`);

  const metadataFile = path.join(workspace, 'release', 'latest.yml');
  const original = fs.readFileSync(metadataFile, 'utf8');
  const metadata = yaml.load(original);
  const installer = path.join(workspace, 'release', metadata.path);
  if (path.dirname(installer) !== path.join(workspace, 'release') || metadata.files?.[0]?.url !== metadata.path) {
    throw new Error('latest.yml does not describe a single installer in release/.');
  }
  const sha512 = await sha512File(installer);
  if (sha512 !== metadata.sha512) throw new Error('Installer does not match latest.yml; rebuild before signing.');

  const message = signedUpdateMessage({ version: String(metadata.version), file: metadata.path, sha512 });
  const signature = crypto.sign(null, message, fs.readFileSync(privateKeyFile, 'utf8')).toString('base64');
  const updated = original.replace(/^metechSignature:.*\r?\n?/m, '').replace(/\s*$/, '\n') + `metechSignature: '${signature}'\n`;

  // Confirm the shipped public key accepts this release before it is published.
  await verifyDownloadedUpdate({ ...yaml.load(updated), downloadedFile: installer }, publicKey);
  fs.writeFileSync(metadataFile, updated);
  return { installer, signature };
}

module.exports = { signUpdate };
if (require.main === module) {
  signUpdate().then(result => console.log(`Signed update: ${path.basename(result.installer)}`), error => {
    console.error(error.message);
    process.exit(1);
  });
}
