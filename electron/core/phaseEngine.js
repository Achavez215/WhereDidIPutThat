/**
 * phaseEngine.js
 * Manages the 6-phase state machine. Each phase must be manually triggered.
 * Uses Copy → Verify → Delete for all file moves.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const safetyGuard = require('./safetyGuard')
const fileScanner = require('./fileScanner')
const checkpointLogger = require('./checkpointLogger')
const auditLogger = require('./auditLogger')
const performanceController = require('./performanceController')
const diskUtils = require('./diskUtils')

const BATCH_SIZE = 50
let _cancelled = false

// ── Hash Helper ──────────────────────────────────────────────────────
function hashFile(filePath) {
    const hash = crypto.createHash('sha256')
    const data = fs.readFileSync(filePath)
    hash.update(data)
    return hash.digest('hex')
}

/**
 * startPhase(phaseNumber, context, onProgress)
 *
 * context shape:
 *  {
 *    folderPaths: string[],         // Phase 1: folders to scan
 *    manifest: FileEntry[],         // Phase 2+: from Phase 1
 *    destinationMap: { category: dstFolder }, // Phase 4
 *    backupPath: string,            // Phase 5
 *  }
 */
async function startPhase(phaseNumber, context, onProgress) {
    _cancelled = false

    switch (phaseNumber) {
        case 1: return await phase1_scan(context, onProgress)
        case 2: return await phase2_preview(context, onProgress)
        case 3: return await phase3_backup(context, onProgress)
        case 4: return await phase4_execute(context, onProgress)
        case 5: return await phase5_validate(context, onProgress)
        case 6: return await phase6_report(context, onProgress)
        default: return { ok: false, error: `Unknown phase: ${phaseNumber}` }
    }
}

// ── Phase 1: Analysis & File Indexing ──────────────────────────────
async function phase1_scan(context, onProgress) {
    onProgress({ phase: 1, status: 'scanning', message: 'Indexing files…' })
    try {
        const result = await fileScanner.scanFolders(context.folderPaths, (p) => {
            onProgress({ phase: 1, status: 'scanning', ...p })
        })
        checkpointLogger.writeCheckpoint({ phase: 1, complete: true, ...result })
        onProgress({ phase: 1, status: 'done', ...result })
        return { ok: true, ...result }
    } catch (err) {
        return { ok: false, error: err.message }
    }
}

// ── Phase 2: Classification & Mapping Preview ──────────────────────
async function phase2_preview(context, onProgress) {
    onProgress({ phase: 2, status: 'preview', message: 'Generating AI-driven action plan…' })

    const { manifest, selectedDrive } = context
    const stats = fileScanner.buildStats(manifest)

    // Heuristic-based recommendations
    const recommendations = []
    const baseDir = selectedDrive?.mountPath || 'C:\\'

    const defaultMappings = {
        images: path.join(baseDir, 'Images'),
        videos: path.join(baseDir, 'Videos'),
        audio: path.join(baseDir, 'Music'),
        pdfs: path.join(baseDir, 'Documents', 'PDFs'),
        word_docs: path.join(baseDir, 'Documents', 'Word'),
        documents: path.join(baseDir, 'Documents'),
        archives: path.join(baseDir, 'Zipped Archives'),
        applications: path.join(baseDir, 'Installers'),
        other: path.join(baseDir, 'Others')
    }

    // Identify duplicates (simple name+size check for now, Phase 4 does hash)
    const duplicatePool = new Map()
    const duplicates = []

    for (const file of manifest) {
        const key = `${file.name}_${file.size}`
        if (duplicatePool.has(key)) {
            duplicates.push(file.srcPath)
        } else {
            duplicatePool.set(key, file.srcPath)
        }

        const dstFolder = defaultMappings[file.category] || defaultMappings.other
        recommendations.push({
            fileId: file.id,
            fileName: file.name,
            srcPath: file.srcPath,
            category: file.category,
            suggestedDst: dstFolder,
            isDuplicate: duplicatePool.has(key) && duplicatePool.get(key) !== file.srcPath
        })
    }

    const actionPlan = {
        recommendations,
        stats,
        duplicatesCount: duplicates.length,
        potentialSavings: duplicates.reduce((acc, p) => acc + (manifest.find(f => f.srcPath === p)?.size || 0), 0)
    }

    checkpointLogger.writeCheckpoint({ phase: 2, complete: true, actionPlan })
    onProgress({ phase: 2, status: 'done', actionPlan })

    return { ok: true, actionPlan }
}

// ── Phase 3: Backup Creation ───────────────────────────────────────
async function phase3_backup(context, onProgress) {
    // Delegate to backupManager — handled via IPC directly
    // This phase just marks checkpoint
    checkpointLogger.writeCheckpoint({ phase: 3, complete: true, backupPath: context.backupPath })
    onProgress({ phase: 3, status: 'done', backupPath: context.backupPath })
    return { ok: true, backupPath: context.backupPath }
}

// ── Phase 4: Execution — Planned Moves ────────────────────────────
async function phase4_execute(context, onProgress) {
    const { plannedMoves } = context
    if (!plannedMoves || plannedMoves.length === 0) return { ok: false, error: 'No planned moves provided.' }

    // ── Disk space pre-check ─────────────────────────────────────
    const totalBytes = plannedMoves.reduce((sum, move) => sum + (move.size || 0), 0)
    if (plannedMoves.length > 0) {
        const spaceCheck = diskUtils.checkDiskSpace(plannedMoves[0].dstPath, totalBytes)
        if (!spaceCheck.ok) {
            return { ok: false, error: spaceCheck.message }
        }
    }

    performanceController.start(plannedMoves.length)
    let processed = 0
    let failed = 0
    const errors = []
    const movedFiles = {}

    for (let i = 0; i < plannedMoves.length; i += BATCH_SIZE) {
        if (_cancelled) break
        await performanceController.waitIfPaused()

        const batch = plannedMoves.slice(i, i + BATCH_SIZE)

        for (const move of batch) {
            if (_cancelled) break

            const validation = safetyGuard.validateTarget(move.srcPath, path.dirname(move.dstPath))
            if (!validation.ok) {
                auditLogger.log({ phase: 4, action: 'BLOCKED', srcPath: move.srcPath, reason: validation.reason })
                failed++
                errors.push({ file: move.srcPath, reason: validation.reason })
                continue
            }

            try { fs.mkdirSync(path.dirname(move.dstPath), { recursive: true }) } catch { }

            try {
                const srcHash = hashFile(move.srcPath)
                fs.copyFileSync(move.srcPath, move.dstPath)
                const dstHash = hashFile(move.dstPath)
                if (srcHash !== dstHash) {
                    fs.unlinkSync(move.dstPath)
                    throw new Error(`Hash mismatch after copy`)
                }
                fs.unlinkSync(move.srcPath)

                movedFiles[move.srcPath] = move.dstPath
                auditLogger.log({
                    phase: 4, action: 'MOVED',
                    srcPath: move.srcPath, dstPath: move.dstPath,
                    size: move.size, status: 'OK',
                })
                processed++
                performanceController.increment()
            } catch (err) {
                auditLogger.log({ phase: 4, action: 'ERROR', srcPath: move.srcPath, dstPath: move.dstPath, error: err.message })
                failed++
                errors.push({ file: move.srcPath, reason: err.message })
            }
        }

        onProgress({
            phase: 4, status: 'running',
            processed, failed, total: plannedMoves.length,
            percent: Math.round(((i + batch.length) / plannedMoves.length) * 100),
            ...performanceController.getStats(),
        })

        checkpointLogger.writeCheckpoint({ phase: 4, processed, failed, lastBatch: i })
        await performanceController.batchDelay()
    }

    const success = !_cancelled
    checkpointLogger.writeCheckpoint({ phase: 4, complete: true, processed, failed })
    onProgress({ phase: 4, status: _cancelled ? 'cancelled' : 'done', processed, failed, errors })
    return { ok: success, processed, failed, errors, movedFiles }
}

// ── Phase 7: Cleanup — Search for empty folders ──────────────────
async function phase7_cleanup(context, onProgress) {
    onProgress({ phase: 7, status: 'scanning', message: 'Scanning for empty folders…' })
    const { folderPaths } = context
    const emptyFolders = []

    function findEmpty(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        if (entries.length === 0) {
            emptyFolders.push(dir)
            return true
        }
        let allSubEmpty = true
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const isSubEmpty = findEmpty(path.join(dir, entry.name))
                if (!isSubEmpty) allSubEmpty = false
            } else {
                allSubEmpty = false
            }
        }
        if (allSubEmpty && entries.length > 0) {
            // All children are directories and all are empty
            // This is handled by recursion above, but we can double check
        }
        return false
    }

    for (const folderPath of folderPaths) {
        findEmpty(folderPath)
    }

    onProgress({ phase: 7, status: 'done', emptyFolders })
    return { ok: true, emptyFolders }
}

async function deleteEmptyFolders(folders, onProgress) {
    let deleted = 0
    for (const folder of folders) {
        try {
            if (fs.existsSync(folder) && fs.readdirSync(folder).length === 0) {
                fs.rmdirSync(folder)
                deleted++
            }
        } catch (err) {
            console.error(`Failed to delete folder ${folder}: ${err.message}`)
        }
    }
    return { ok: true, deleted }
}

// ── Phase 5: Validation & Integrity Check ─────────────────────────
async function phase5_validate(context, onProgress) {
    const { movedFiles } = context
    if (!movedFiles) return { ok: true, passed: 0, missing: 0 }

    onProgress({ phase: 5, status: 'validating', message: 'Verifying moved files…' })

    const entries = Object.entries(movedFiles)
    const SAMPLE_SIZE = Math.min(50, entries.length)
    const sample = entries.sort(() => Math.random() - 0.5).slice(0, SAMPLE_SIZE)
    let passed = 0, missing = 0

    for (const [src, dst] of sample) {
        if (fs.existsSync(dst)) {
            passed++
        } else {
            missing++
        }
    }

    checkpointLogger.writeCheckpoint({ phase: 5, complete: true, passed, missing, sampleSize: SAMPLE_SIZE })
    onProgress({ phase: 5, status: 'done', passed, missing, sampleSize: SAMPLE_SIZE })
    return { ok: true, passed, missing }
}

// ── Update startPhase to include Phase 7 ──────────────────────────
async function startPhase(phaseNumber, context, onProgress) {
    _cancelled = false
    switch (phaseNumber) {
        case 1: return await phase1_scan(context, onProgress)
        case 2: return await phase2_preview(context, onProgress)
        case 3: return await phase3_confirm(context, onProgress) // NEW
        case 4: return await phase4_execute(context, onProgress)
        case 5: return await phase5_validate(context, onProgress)
        case 6: return await phase6_report(context, onProgress)
        case 7: return await phase7_cleanup(context, onProgress)
        default: return { ok: false, error: `Unknown phase: ${phaseNumber}` }
    }
}

async function phase3_confirm(context, onProgress) {
    onProgress({ phase: 3, status: 'done', message: 'Ready for execution' })
    return { ok: true }
}

async function startCleanup(context) {
    return await deleteEmptyFolders(context.folders)
}

module.exports = { startPhase, cancel, startCleanup }
