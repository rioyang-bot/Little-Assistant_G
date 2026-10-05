// Creates the Ed25519 key pair that signs update installers.
// The private key is written OUTSIDE this repository and must be kept offline;
// only the public key is committed and shipped inside the app.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const workspace = path.resolve(__dirname, '..');
const publicKeyFile = path.join(workspace, 'electron', 'update-signing-public-key.pem');
const privateKeyFile = path.resolve(process.argv[2] || path.join(os.homedir(), 'METech-update-signing', 'update-signing-private.pem'));

const relative = path.relative(workspace, privateKeyFile);
if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
  throw new Error('The private signing key must not be stored inside the repository.');
}
if (fs.existsSync(privateKeyFile) || fs.existsSync(publicKeyFile)) {
  throw new Error('A signing key already exists. Replacing it would stop installed apps from accepting updates.');
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(path.dirname(privateKeyFile), { recursive: true });
fs.writeFileSync(privateKeyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
fs.writeFileSync(publicKeyFile, publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' });

if (process.platform === 'win32') {
  // Restrict the private key to the current account only.
  require('node:child_process').execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe'),
    [privateKeyFile, '/inheritance:r', '/grant:r', `${process.env.USERDOMAIN}\\${process.env.USERNAME}:F`], { stdio: 'ignore' });
}

console.log(`Private key (keep offline, back it up): ${privateKeyFile}`);
console.log(`Public key (commit and ship): ${publicKeyFile}`);
