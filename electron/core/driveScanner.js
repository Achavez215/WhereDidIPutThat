/**
 * driveScanner.js
 * Enumerates all available drives and top-level user folders.
 * Windows: uses WMIC. Returns a consistent schema usable by the UI.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const safetyGuard = require('./safetyGuard')

const CLOUD_SIGNATURES = ['onedrive', 'googledrive', 'dropbox', 'box', 'icloud']

function isCloudPath(label = '', mountPath = '') {
    const combined = (label + mountPath).toLowerCase()
    return CLOUD_SIGNATURES.some(sig => combined.includes(sig))
}

function listDrives() {
    try {
        const raw = execSync(
            'wmic logicaldisk get DeviceID,DriveType,FreeSpace,Size,VolumeName /format:csv',
            { encoding: 'utf8', timeout: 8000 }
        )

        const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('Node'))
        const drives = []

        for (const line of lines) {
            const parts = line.trim().split(',')
            if (parts.length < 6) continue
            // CSV columns: Node, DeviceID, DriveType, FreeSpace, Size, VolumeName
            const [, deviceId, driveType, freeSpace, size, volumeName] = parts

            if (!deviceId || !deviceId.includes(':')) continue

            const letter = deviceId.trim()
            const mountPath = letter + '\\'
            const typeNum = parseInt(driveType, 10)
            // DriveType: 2=Removable, 3=Local, 4=Network, 5=CD, 6=RAM
            if (typeNum === 5 || typeNum === 6) continue // skip CD/RAM

            const label = (volumeName || '').trim() || letter
            const cloud = isCloudPath(label, mountPath)
            const freeBytes = parseInt(freeSpace, 10) || 0
            const totalBytes = parseInt(size, 10) || 0

            drives.push({
                letter,
                mountPath,
                label,
                driveType: typeNum,
                typeLabel: typeNum === 2 ? 'Removable' : typeNum === 4 ? 'Network' : 'Local',
                isCloud: cloud,
                isSystem: letter === 'C:',
                freeBytes,
                totalBytes,
                freeFormatted: formatBytes(freeBytes),
                totalFormatted: formatBytes(totalBytes),
            })
        }

        return { ok: true, drives }
    } catch (err) {
        return { ok: false, error: err.message, drives: [] }
    }
}

function listTopLevelFolders(drivePath) {
    try {
        const COMMON_USER_FOLDERS = [
            'Desktop', 'Documents', 'Downloads', 'Pictures',
            'Music', 'Videos', 'OneDrive',
        ]

        const userHome = process.env.USERPROFILE || drivePath
        const entries = []

        // Walk the drive root for top-level dirs + user home dirs
        const rootEntries = fs.readdirSync(drivePath, { withFileTypes: true })
        for (const entry of rootEntries) {
            if (!entry.isDirectory()) continue
            const fullPath = path.join(drivePath, entry.name)
            if (safetyGuard.isProtected(fullPath)) continue
            if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue
            entries.push({ name: entry.name, fullPath, isUserFolder: false })
        }

        // Also surface common user folders from USERPROFILE
        for (const folderName of COMMON_USER_FOLDERS) {
            const fullPath = path.join(userHome, folderName)
            if (fs.existsSync(fullPath) && !safetyGuard.isProtected(fullPath)) {
                const already = entries.find(e => e.fullPath === fullPath)
                if (!already) {
                    entries.push({ name: folderName, fullPath, isUserFolder: true })
                } else {
                    already.isUserFolder = true
                }
            }
        }

        return { ok: true, folders: entries }
    } catch (err) {
        return { ok: false, error: err.message, folders: [] }
    }
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

module.exports = { listDrives, listTopLevelFolders }
