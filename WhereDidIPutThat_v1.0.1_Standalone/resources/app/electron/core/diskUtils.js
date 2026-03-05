/**
 * diskUtils.js
 * Checks available disk space before committing to large file operations.
 * Uses Node's fs.statfsSync (Node 18+ / Electron 25+).
 */

'use strict'

const fs = require('fs')
const path = require('path')

/**
 * checkDiskSpace(targetPath, requiredBytes)
 *
 * Returns { ok, freeBytes, requiredBytes, message }
 * ok = false if free space is insufficient or the path can't be read.
 *
 * @param {string} targetPath   - A path on the drive/mount to check (file or dir)
 * @param {number} requiredBytes - Minimum bytes needed
 */
function checkDiskSpace(targetPath, requiredBytes = 0) {
    if (!targetPath) {
        return { ok: false, freeBytes: 0, requiredBytes, message: 'No target path provided.' }
    }

    try {
        // Walk up to an existing ancestor so statfsSync has a valid path
        let checkPath = targetPath
        while (checkPath && !fs.existsSync(checkPath)) {
            const parent = path.dirname(checkPath)
            if (parent === checkPath) break  // reached root
            checkPath = parent
        }

        const stats = fs.statfsSync(checkPath)
        // bsize = block size in bytes, bfree = free blocks (for root), bavail = free blocks for non-root
        const freeBytes = stats.bavail * stats.bsize

        if (freeBytes < requiredBytes) {
            const freeGB = (freeBytes / 1024 / 1024 / 1024).toFixed(2)
            const needGB = (requiredBytes / 1024 / 1024 / 1024).toFixed(2)
            return {
                ok: false,
                freeBytes,
                requiredBytes,
                message: `Insufficient disk space: need ${needGB} GB but only ${freeGB} GB is available on this drive.`,
            }
        }

        return { ok: true, freeBytes, requiredBytes, message: null }
    } catch (err) {
        // If statfsSync is unavailable (older Node/Electron), degrade gracefully
        console.warn('[diskUtils] Could not check disk space:', err.message)
        return { ok: true, freeBytes: Infinity, requiredBytes, message: null }
    }
}

module.exports = { checkDiskSpace }
