/**
 * historyManager.js
 * Manages the collection and retrieval of past organization session summaries
 * by scanning for FileOrg_Backup folders and their manifests.
 */

const fs = require('fs');
const path = require('path');
const pathManager = require('./pathManager');
const backupManager = require('./backupManager');

/**
 * getSessionHistory(destDrive) -> Promise<SessionEntry[]>
 * Scans the backup root for FileOrg_Backup folders.
 */
async function getSessionHistory(destDrive) {
    const backupRoot = pathManager.getBackupRootDir(destDrive);

    if (!fs.existsSync(backupRoot)) {
        return [];
    }

    try {
        const dirs = fs.readdirSync(backupRoot);
        const history = [];

        for (const dirName of dirs) {
            if (!dirName.startsWith('FileOrg_Backup_')) continue;

            const fullPath = path.join(backupRoot, dirName);
            const stats = fs.statSync(fullPath);
            if (!stats.isDirectory()) continue;

            const manifestPath = path.join(fullPath, 'backup_manifest.json');
            let manifest = null;
            let status = 'completed';

            if (fs.existsSync(manifestPath)) {
                try {
                    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    // Check if a rollback log exists or if the backup folder is empty/removed
                    // (Actually, if it's in this list, it hasn't been deleted yet)
                } catch (e) {
                    console.error(`Failed to parse manifest for ${dirName}:`, e);
                }
            }

            history.push({
                id: dirName,
                date: stats.birthtime,
                path: fullPath,
                fileCount: manifest?.fileCount || 0,
                status: status,
                hasBackup: !!manifest
            });
        }

        // Sort by date descending
        return history.sort((a, b) => b.date - a.date);
    } catch (err) {
        console.error('Error reading session history:', err);
        return [];
    }
}

/**
 * undoSession(sessionId, destDrive, onProgress)
 * Triggers a rollback for a specific session.
 */
async function undoSession(sessionId, destDrive, onProgress) {
    const backupRoot = pathManager.getBackupRootDir(destDrive);
    const sessionPath = path.join(backupRoot, sessionId);
    const manifestPath = path.join(sessionPath, 'backup_manifest.json');

    if (!fs.existsSync(manifestPath)) {
        throw new Error('Backup manifest not found for this session.');
    }

    return await backupManager.rollback({ manifestPath }, onProgress);
}

module.exports = {
    getSessionHistory,
    undoSession
};
