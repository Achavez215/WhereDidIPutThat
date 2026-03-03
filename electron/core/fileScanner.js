/**
 * fileScanner.js
 * Recursively indexes a folder, classifies files by type,
 * and emits batched progress events via a callback.
 */

const fs = require('fs')
const path = require('path')
const safetyGuard = require('./safetyGuard')
const checkpointLogger = require('./checkpointLogger')

const BATCH_SIZE = 200

// ──────────────────────────────────────────────
// Classification rules
// ──────────────────────────────────────────────
const CATEGORY_MAP = {
    images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.svg', '.ico', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw'],
    videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpeg', '.mpg', '.3gp', '.ts'],
    audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus', '.aiff'],
    documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.odt', '.ods', '.odp', '.md', '.csv', '.json', '.xml', '.html', '.htm'],
    archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.dmg'],
}

function classifyFile(filePath) {
    const ext = path.extname(filePath).toLowerCase()
    for (const [category, exts] of Object.entries(CATEGORY_MAP)) {
        if (exts.includes(ext)) return category
    }
    return 'other'
}

// ──────────────────────────────────────────────
// Main scanner
// ──────────────────────────────────────────────

/**
 * scanFolders(folderPaths, onProgress) → { manifest, stats }
 *
 * manifest: Array of { id, name, ext, category, srcPath, size, modified }
 * stats: { total, byCategory: { images: N, … } }
 */
async function scanFolders(folderPaths, onProgress) {
    const manifest = []
    let scanned = 0
    let skipped = 0
    let idCounter = 0

    for (const folderPath of folderPaths) {
        if (safetyGuard.isProtected(folderPath)) {
            onProgress({ type: 'warning', message: `Skipping protected path: ${folderPath}` })
            skipped++
            continue
        }
        await walkDir(folderPath, manifest, () => {
            idCounter++
            scanned++
            if (scanned % BATCH_SIZE === 0) {
                onProgress({ type: 'count', scanned, manifest: [] })
            }
        })
    }

    // Final progress push
    onProgress({ type: 'complete', scanned, skipped })

    const stats = buildStats(manifest)
    checkpointLogger.writeCheckpoint({ phase: 1, manifest, stats, folderPaths })

    return { manifest, stats }
}

function walkDir(dirPath, results, onFile) {
    return new Promise((resolve) => {
        let entries
        try {
            entries = fs.readdirSync(dirPath, { withFileTypes: true })
        } catch {
            resolve()
            return
        }
        const subdirs = []
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)
            if (entry.name.startsWith('.')) continue
            if (safetyGuard.isProtected(fullPath)) continue

            if (entry.isDirectory()) {
                subdirs.push(fullPath)
            } else if (entry.isFile()) {
                if (safetyGuard.isProtectedExtension(fullPath)) continue
                let stat
                try { stat = fs.statSync(fullPath) } catch { continue }
                results.push({
                    id: `f_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    name: entry.name,
                    ext: path.extname(entry.name).toLowerCase(),
                    category: classifyFile(fullPath),
                    srcPath: fullPath,
                    size: stat.size,
                    modified: stat.mtimeMs,
                })
                onFile()
            }
        }
        // Process subdirectories
        Promise.all(subdirs.map(d => walkDir(d, results, onFile))).then(resolve)
    })
}

function buildStats(manifest) {
    const byCategory = { images: 0, videos: 0, audio: 0, documents: 0, archives: 0, other: 0 }
    let totalSize = 0
    for (const f of manifest) {
        byCategory[f.category] = (byCategory[f.category] || 0) + 1
        totalSize += f.size
    }
    return { total: manifest.length, totalSize, byCategory }
}

module.exports = { scanFolders, classifyFile, buildStats }
