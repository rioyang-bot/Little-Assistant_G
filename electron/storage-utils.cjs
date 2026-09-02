const fs = require('fs');
const path = require('path');
let electronApp = null;

try {
  const electron = require('electron');
  electronApp = electron.app || (electron.remote && electron.remote.app);
} catch (e) {
  // Standalone node environment or unit test outside electron
}

/**
 * Returns the absolute writable path for configuration files stored in the OS standard userData directory.
 * E.g., on Windows: C:\Users\<Username>\AppData\Roaming\METechAssistant\<filename>
 * 
 * Includes auto-migration: if target doesn't exist in userData yet, but exists in a legacy location
 * (e.g. project directory in development), it automatically copies the legacy config into userData.
 *
 * @param {string} filename - e.g. 'calendar-config.json', 'email-config.json', 'pet-preferences.json'
 * @param {{userDir?: string, legacyDir?: string}} [options] - Optional path overrides for isolated tests
 * @returns {string} Absolute path to the config file
 */
function getStoragePath(filename, options = {}) {
  let userDir = options.userDir || null;

  try {
    if (electronApp && typeof electronApp.getPath === 'function') {
      userDir = electronApp.getPath('userData');
    }
  } catch (err) {
    // electronApp not ready yet or unavailable
  }

  // Fallback if app.getPath('userData') is not available (e.g. in basic Node.js test runs)
  if (!userDir) {
    userDir = path.join(__dirname, '..');
  }

  // Ensure target storage directory exists
  try {
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
  } catch (err) {
    console.error(`[StorageUtils] Failed to create directory: ${userDir}`, err.message);
  }

  const targetFilePath = path.join(userDir, filename);

  // Auto-migration from legacy project directory to userData directory
  try {
    if (!fs.existsSync(targetFilePath)) {
      const legacyDir = options.legacyDir || path.join(__dirname, '..');
      const legacyPath = path.join(legacyDir, filename);
      // Ensure we don't try to migrate from inside a virtual .asar archive
      if (!legacyPath.includes('app.asar') && fs.existsSync(legacyPath)) {
        const content = fs.readFileSync(legacyPath, 'utf8');
        fs.writeFileSync(targetFilePath, content, 'utf8');
        console.log(`[StorageUtils] Successfully migrated legacy "${filename}" to: ${targetFilePath}`);
      }
    }
  } catch (err) {
    console.warn(`[StorageUtils] Migration notice for "${filename}":`, err.message);
  }

  return targetFilePath;
}

module.exports = {
  getStoragePath
};
