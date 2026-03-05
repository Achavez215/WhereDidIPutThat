/**
 * fileScanner.js
 * Recursively indexes a folder, classifies files by type,
 * and emits batched progress events via a callback.
 */

const fs = require('fs')
const fsPromises = fs.promises
const path = require('path')
const safetyGuard = require('./safetyGuard')
const checkpointLogger = require('./checkpointLogger')
const pathManager = require('./pathManager')
const dbManager = require('./dbManager')

const BATCH_SIZE = 200
const YIELD_THRESHOLD = 500 // Yield event loop every N entries
const MAX_MANIFEST_FILES = 500000 // Prevent OOM crashes

// ──────────────────────────────────────────────
// Classification rules
// ──────────────────────────────────────────────
const CATEGORY_MAP = {
    images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.svg', '.ico', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw'],
    videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpeg', '.mpg', '.3gp', '.ts'],
    audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus', '.aiff'],
    pdfs: ['.pdf'],
    word_docs: ['.doc', '.docx', '.rtf', '.odt'],
    documents: ['.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.ods', '.odp', '.md', '.csv', '.json', '.xml', '.html', '.htm'],
    archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.dmg'],
    applications: ['.exe', '.msi', '.bat', '.sh', '.app', '.com'],
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
 * scanFolders(folderPaths, onProgress) → { tree, stats }
 *
 * tree: Hierarchical structure of folders and files
 * stats: { total, byCategory: { images: N, … } }
 */
async function scanFolders(folderPaths, onProgress) {
    const tree = { name: 'Root', type: 'root', children: [] }
    let scanned = 0
    let skipped = 0

    // Initialize session database
    dbManager.initDb()
    let fileBuffer = []

    for (const folderPath of folderPaths) {
        if (safetyGuard.isProtected(folderPath)) {
            onProgress({ type: 'warning', message: `Skipping protected path: ${folderPath}` })
            skipped++
            continue
        }

        const folderNode = {
            name: path.basename(folderPath) || folderPath, // handle root paths like C:\
            path: folderPath,
            type: 'folder',
            children: [],
            stats: { images: 0, videos: 0, pdfs: 0, word_docs: 0, archives: 0, applications: 0, documents: 0, audio: 0, other: 0 }
        }
        tree.children.push(folderNode)

        await walkDir(folderPath, folderNode, fileBuffer, () => {
            scanned = scanned + 1
            if (scanned % BATCH_SIZE === 0) {
                // Return partial stats so UI can show progress count
                onProgress({ type: 'count', scanned, currentFile: folderPath })
            }
        }, { entryCount: 0 })
    }

    // Flush remaining buffer
    if (fileBuffer.length > 0) {
        dbManager.insertFiles(fileBuffer)
    }

    const stats = dbManager.getTotalStats()
    // Write checkpoint for Phase 1 completion
    checkpointLogger.writeCheckpoint({ phase: 1, tree, stats, folderPaths })

    // Return everything needed for the UI and the next phase
    onProgress({ type: 'complete', scanned, skipped, stats })
    return { tree, stats }
}

async function walkDir(dirPath, parentNode, manifest, onFile, state) {
    let dir
    const longDirPath = pathManager.toLongPath(dirPath)
    try {
        dir = await fsPromises.opendir(longDirPath)
    } catch {
        return
    }

    try {
        for await (const entry of dir) {
            state.entryCount++
            // Yield to event loop periodically to keep main thread and IPC responsive
            if (state.entryCount % YIELD_THRESHOLD === 0) {
                await new Promise(resolve => setImmediate(resolve))
            }

            const fullPath = path.join(dirPath, entry.name)
            const longFullPath = pathManager.toLongPath(fullPath)
            if (entry.name.startsWith('.')) continue
            if (safetyGuard.isProtected(fullPath)) continue

            if (entry.isDirectory()) {
                const folderNode = {
                    name: entry.name,
                    path: fullPath,
                    type: 'folder',
                    children: [],
                    stats: { images: 0, videos: 0, pdfs: 0, word_docs: 0, archives: 0, applications: 0, documents: 0, audio: 0, other: 0 }
                }
                parentNode.children.push(folderNode)
                await walkDir(fullPath, folderNode, manifest, onFile, state)

                // Bubble up stats to parent
                for (const cat in folderNode.stats) {
                    parentNode.stats[cat] += folderNode.stats[cat]
                }
            } else if (entry.isFile()) {
                if (safetyGuard.isProtectedExtension(fullPath)) continue
                let stat
                try {
                    stat = await fsPromises.stat(longFullPath)
                } catch {
                    continue
                }

                const category = classifyFile(fullPath)
                const fileEntry = {
                    id: `f_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    name: entry.name,
                    ext: path.extname(entry.name).toLowerCase(),
                    category: category,
                    srcPath: fullPath,
                    size: stat.size,
                    modified: stat.mtimeMs,
                }

                if (manifest.length >= MAX_MANIFEST_FILES) {
                    throw new Error(`Out of Memory Protection: Scan limit of ${MAX_MANIFEST_FILES} files reached.`)
                }
                parentNode.children.push({ ...fileEntry, type: 'file' })
                parentNode.stats[category] = (parentNode.stats[category] || 0) + 1

                manifest.push(fileEntry)
                if (manifest.length >= 500) {
                    dbManager.insertFiles(manifest.splice(0, manifest.length))
                }

                onFile()
            }
        }
    } catch (err) {
        // Directory may have been removed or perms changed mid-scan
        return
    }
}

function buildStats(manifest) {
    const byCategory = { images: 0, videos: 0, audio: 0, pdfs: 0, word_docs: 0, documents: 0, archives: 0, applications: 0, other: 0 }
    let totalSize = 0
    for (const f of manifest) {
        byCategory[f.category] = (byCategory[f.category] || 0) + 1
        totalSize += f.size
    }
    return { total: manifest.length, totalSize, byCategory }
}

module.exports = { scanFolders, classifyFile, buildStats }
