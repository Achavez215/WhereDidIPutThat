/**
 * pathManager.js
 * Computes standard, cross-platform paths for app data, logs, and settings.
 * Ensures the app follows OS-standard storage rules.
 */

const { app } = require('electron')
const path = require('path')
const fs = require('fs')

/**
 * getAppDataPath()
 * Returns the OS-standard directory for this app's data/config.
 * Win: %APPDATA%/WhereDidIPutThat
 * Mac: ~/Library/Application Support/WhereDidIPutThat
 * Linux: ~/.config/WhereDidIPutThat
 */
function getAppDataPath() {
    return app.getPath('userData')
}

function getLogFile() {
    const dir = path.join(getAppDataPath(), 'logs')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, 'audit.log')
}

function getCheckpointFile() {
    const dir = path.join(getAppDataPath(), 'checkpoints')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, 'session_checkpoint.json')
}

function getSettingsFile() {
    return path.join(getAppDataPath(), 'settings.json')
}

function getBackupRootDir(driveRoot) {
    // If driveRoot is provided (e.g. "D:/"), place backups there.
    // Otherwise, default to user's home directory.
    const base = driveRoot || app.getPath('home')
    const dir = path.join(base, 'WDIPT_Backups')
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true })
        } catch (e) {
            // Fallback to home if drive root is read-only
            return path.join(app.getPath('home'), 'WDIPT_Backups')
        }
    }
    return dir
}

module.exports = {
    getAppDataPath,
    getLogFile,
    getCheckpointFile,
    getSettingsFile,
    getBackupRootDir
}
