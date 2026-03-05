/**
 * duplicateDetector.js
 * Detects duplicate files in a manifest using MD5 content hashing.
 * Groups files by hash and flags any with 2+ entries as duplicates.
 */

'use strict'

const fs = require('fs')
const crypto = require('crypto')

/**
 * hashFileMD5(filePath) → hex string | null
 * Fast MD5 hash for duplicate detection (not used for integrity — SHA-256 handles that).
 */
function hashFileMD5(filePath) {
    try {
        const data = fs.readFileSync(filePath)
        return crypto.createHash('md5').update(data).digest('hex')
    } catch {
        return null
    }
}

/**
 * findDuplicates(manifest, onProgress) → { groups, totalDuplicates, wastedBytes }
 *
 * manifest: FileEntry[] from fileScanner (must have srcPath and size fields)
 * onProgress: (checked, total) => void
 *
 * Returns:
 *   groups: Array of { hash, size, files: [srcPath, ...] } where files.length >= 2
 *   totalDuplicates: number of redundant files (total files - unique hashes with dupes)
 *   wastedBytes: bytes that could be freed by removing duplicates
 */
async function findDuplicates(manifest, onProgress) {
    const hashMap = {} // hash → [srcPath]
    const total = manifest.length

    for (let i = 0; i < total; i++) {
        const file = manifest[i]
        if (onProgress && i % 50 === 0) onProgress(i, total)

        const hash = hashFileMD5(file.srcPath)
        if (!hash) continue

        if (!hashMap[hash]) {
            hashMap[hash] = { hash, size: file.size, files: [] }
        }
        hashMap[hash].files.push(file.srcPath)
    }

    if (onProgress) onProgress(total, total)

    // Only return groups with more than 1 file
    const groups = Object.values(hashMap).filter(g => g.files.length > 1)

    let totalDuplicates = 0
    let wastedBytes = 0

    for (const g of groups) {
        const extras = g.files.length - 1 // keep 1, rest are duplicates
        totalDuplicates += extras
        wastedBytes += extras * g.size
    }

    return { groups, totalDuplicates, wastedBytes }
}

module.exports = { findDuplicates }
