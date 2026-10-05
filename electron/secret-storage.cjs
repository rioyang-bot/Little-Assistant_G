const { safeStorage } = require('electron');

function isSecretStorageAvailable() {
  try {
    return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
  } catch (error) {
    return false;
  }
}

// Encrypts with the OS key store (DPAPI on Windows). When it is unavailable the
// secret is NOT written in a reversible encoding; callers keep it in memory only.
function encryptSecret(plaintext) {
  if (!plaintext || !isSecretStorageAvailable()) return '';
  try {
    return safeStorage.encryptString(plaintext).toString('base64');
  } catch (error) {
    console.error('safeStorage encryption error:', error.message);
    return '';
  }
}

function decryptSecret(cipherBase64) {
  if (!cipherBase64) return '';
  try {
    const buffer = Buffer.from(cipherBase64, 'base64');
    if (isSecretStorageAvailable()) {
      return safeStorage.decryptString(buffer);
    }
    return buffer.toString('utf8');
  } catch (error) {
    // Earlier versions stored plain base64 when encryption was unavailable.
    // Read it once so the next save can migrate it to encrypted storage.
    try {
      return Buffer.from(cipherBase64, 'base64').toString('utf8');
    } catch (decodeError) {
      return '';
    }
  }
}

module.exports = { encryptSecret, decryptSecret, isSecretStorageAvailable };
