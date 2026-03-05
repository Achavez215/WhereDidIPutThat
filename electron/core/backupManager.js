/**
 * backupManager.js
 * Creates, manages, and rolls back file backups before Phase 4.
 * Backups stored in a timestamped folder on the same drive (default).
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const safetyGuard = require('./safetyGuard')
const auditLogger = require('./auditLogger')
const performanceController = require('./performanceController')
const pathManager = require('./pathManager')
const diskUtils = require('./diskUtils')

const BATCH_SIZE = 50
let _cancelled = false

/**
 * createBackup(files, destDrive, onProgress) → { ok, backupPath, manifest }
 *
 * files: FileEntry[] from the manifest
 * destDrive: root path to place backup folder (default: same drive as first file)
 */
async function createBackup(files, destDrive, onProgress) {
    _cancelled = false
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = path.join(pathManager.getBackupRootDir(destDrive), `FileOrg_Backup_${ts}`)

    // ── Disk space pre-check ─────────────────────────────────────
    const totalSizeBytes = files.reduce((sum, f) => sum + (f.size || 0), 0)
    // Overhead: Backup + Final Destination (if on the same drive)
    // For simplicity, we check for 2.1x the size to be extremely safe
    const requiredSpace = Math.ceil(totalSizeBytes * 2.1)

    const spaceCheck = diskUtils.checkDiskSpace(destDrive || os.homedir(), requiredSpace)
    if (!spaceCheck.ok) {
        return { ok: false, error: `Insufficient space for safe operation. ${spaceCheck.message} (Estimated overhead: 2.1x total size)` }
    }

    try {
        fs.mkdirSync(pathManager.toLongPath(backupPath), { recursive: true })
    } catch (err) {
        return { ok: false, error: `Could not create backup folder: ${err.message}` }
    }

    const backupManifest = []
    performanceController.start(files.length)
    let copied = 0, failed = 0

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        if (_cancelled) break
        await performanceController.waitIfPaused()

        const batch = files.slice(i, i + BATCH_SIZE)
        for (const file of batch) {
            if (_cancelled) break
            if (safetyGuard.isProtected(file.srcPath)) continue

            // Preserve relative path structure inside backup (handles UNC + drive paths)
            const relPath = path.relative(path.parse(file.srcPath).root, file.srcPath)
            const dstPath = path.join(backupPath, relPath)

            try {
                fs.mkdirSync(pathManager.toLongPath(path.dirname(dstPath)), { recursive: true })
                fs.copyFileSync(pathManager.toLongPath(file.srcPath), pathManager.toLongPath(dstPath))
                backupManifest.push({ original: file.srcPath, backup: dstPath, size: file.size })
                copied++
                performanceController.increment()
            } catch (err) {
                failed++
                auditLogger.log({ phase: 3, action: 'BACKUP_FAIL', srcPath: file.srcPath, error: err.message })
            }
        }

        onProgress({
            phase: 3, status: 'running',
            copied, failed, total: files.length,
            percent: Math.round(((i + batch.length) / files.length) * 100),
        })

        await performanceController.batchDelay()
    }

    // Write backup manifest
    const manifestPath = path.join(backupPath, 'backup_manifest.json')
    fs.writeFileSync(pathManager.toLongPath(manifestPath), JSON.stringify({
        createdAt: new Date().toISOString(),
        backupPath,
        fileCount: copied,
        entries: backupManifest,
    }, null, 2), 'utf8')

    auditLogger.log({ phase: 3, action: 'BACKUP_CREATED', dstPath: backupPath, size: copied })
    return { ok: true, backupPath, manifestPath, copied, failed }
}

/**
 * rollback(backupMeta, onProgress) → { ok, restored, failed }
 *
 * Reads backup_manifest.json and restores files to original locations.
 */
async function rollback(backupMeta, onProgress) {
    _cancelled = false
    const { manifestPath } = backupMeta

    let manifest
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch (err) {
        return { ok: false, error: `Cannot read backup manifest: ${err.message}` }
    }

    const entries = manifest.entries || []
    performanceController.start(entries.length)
    let restored = 0, failed = 0

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        if (_cancelled) break
        await performanceController.waitIfPaused()

        const batch = entries.slice(i, i + BATCH_SIZE)
        for (const entry of batch) {
            try {
                fs.mkdirSync(pathManager.toLongPath(path.dirname(entry.original)), { recursive: true })
                fs.copyFileSync(pathManager.toLongPath(entry.backup), pathManager.toLongPath(entry.original))
                restored++
                performanceController.increment()
                auditLogger.log({ phase: 4, action: 'ROLLBACK', srcPath: entry.backup, dstPath: entry.original })
            } catch (err) {
                failed++
                auditLogger.log({ phase: 4, action: 'ROLLBACK_FAIL', srcPath: entry.backup, error: err.message })
            }
        }

        onProgress({
            status: 'rollback', restored, failed, total: entries.length,
            percent: Math.round(((i + batch.length) / entries.length) * 100),
        })

        await performanceController.batchDelay()
    }

    return { ok: true, restored, failed }
}

/**
 * deleteBackup(backupPath) → { ok }
 * Recursively removes the backup folder. Requires explicit user call.
 */
function deleteBackup(backupPath) {
    try {
        // Safety: ensure it's actually a FileOrg backup
        if (!path.basename(backupPath).startsWith('FileOrg_Backup_')) {
            return { ok: false, error: 'Path does not appear to be a FileOrg backup folder.' }
        }
        fs.rmSync(pathManager.toLongPath(backupPath), { recursive: true, force: true })
        auditLogger.log({ phase: 6, action: 'BACKUP_DELETED', dstPath: backupPath })
        return { ok: true }
    } catch (err) {
        return { ok: false, error: err.message }
    }
}

module.exports = { createBackup, rollback, deleteBackup }
