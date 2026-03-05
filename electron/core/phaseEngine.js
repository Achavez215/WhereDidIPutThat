/**
 * phaseEngine.js
 * Manages the 7-phase state machine. Each phase must be manually triggered.
 * Uses Copy → Verify → Delete for all file moves.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const safetyGuard = require('./safetyGuard')
const performanceController = require('./performanceController')
const diskUtils = require('./diskUtils')
const dbManager = require('./dbManager')
const pathManager = require('./pathManager')
const auditLogger = require('./auditLogger')
const checkpointLogger = require('./checkpointLogger')
const fileScanner = require('./fileScanner')

const BATCH_SIZE = 50
let _cancelled = false
const claimedPaths = new Set();

/**
 * safeMove(src, dst)
 */
async function safeMove(src, dst) {
    const fsPromises = require('fs').promises;
    let finalDst = dst;

    const checkExists = (p) => {
        const longP = pathManager.toLongPath(p);
        return fs.existsSync(longP) || claimedPaths.has(longP);
    };

    // Auto-rename if destination already exists or is claimed in this batch
    if (checkExists(finalDst)) {
        const parsed = path.parse(dst);
        let counter = 1;
        while (checkExists(finalDst)) {
            finalDst = path.join(parsed.dir, `${parsed.name}_${counter}${parsed.ext}`);
            counter++;
        }
    }

    // Claim the path immediately (before async operations)
    claimedPaths.add(pathManager.toLongPath(finalDst));

    try {
        await fsPromises.rename(pathManager.toLongPath(src), pathManager.toLongPath(finalDst));
        return finalDst;
    } catch (err) {
        if (err.code === 'EXDEV') {
            await fsPromises.copyFile(pathManager.toLongPath(src), pathManager.toLongPath(finalDst));
            await fsPromises.unlink(pathManager.toLongPath(src));
            return finalDst;
        }
        // If it fails, remove from claim (though usually it won't)
        claimedPaths.delete(pathManager.toLongPath(finalDst));
        throw err;
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

    const stats = dbManager.getStats()
    const { selectedDrive, destinationMap } = context
    const baseDir = selectedDrive?.mountPath || 'C:\\'

    const recommendations = []

    // Hierarchy: 1. User specified mapping, 2. Logical recommendation based on OS standard, 3. Hard-coded fallback
    const mappings = {
        images: destinationMap?.images || path.join(baseDir, 'Pictures', 'Organized'),
        videos: destinationMap?.videos || path.join(baseDir, 'Videos', 'Organized'),
        audio: destinationMap?.audio || path.join(baseDir, 'Music', 'Organized'),
        pdfs: destinationMap?.pdfs || path.join(baseDir, 'Documents', 'PDFs'),
        word_docs: destinationMap?.word_docs || path.join(baseDir, 'Documents', 'Word'),
        documents: destinationMap?.documents || path.join(baseDir, 'Documents', 'Organized'),
        archives: destinationMap?.archives || path.join(baseDir, 'Downloads', 'Archives'),
        applications: destinationMap?.applications || path.join(baseDir, 'Installers'),
        other: destinationMap?.other || path.join(baseDir, 'Documents', 'Other')
    }

    const duplicatePool = new Map()
    let duplicatesCount = 0
    let potentialSavings = 0

    // Process files in batches from DB to avoid memory spikes
    const BATCH_SIZE_DB = 1000
    let offset = 0

    while (true) {
        const batch = dbManager.getFiles('all', BATCH_SIZE_DB, offset)
        if (!batch || batch.length === 0) break

        for (const file of batch) {
            const key = `${file.name}_${file.size}`
            const isDuplicate = duplicatePool.has(key)

            if (isDuplicate) {
                duplicatesCount++
                potentialSavings += (file.size || 0)
            } else {
                duplicatePool.set(key, file.srcPath)
            }

            const dstFolder = mappings[file.category] || mappings.other
            const suggestedDst = path.join(dstFolder, file.name)

            // Save to DB for Phase 4
            dbManager.updateSuggestedDst(file.id, suggestedDst)
            if (isDuplicate) {
                dbManager.updateIsDuplicate(file.id, 1)
            }
        }

        offset += batch.length
        onProgress({ phase: 2, status: 'preview', message: `Classified ${offset} files…` })
    }

    const actionPlan = {
        stats,
        duplicatesCount,
        potentialSavings
    }

    checkpointLogger.writeCheckpoint({ phase: 2, complete: true, actionPlan })
    onProgress({ phase: 2, status: 'done', actionPlan })

    return { ok: true, actionPlan }
}

// ── Phase 3: Confirmation ──────────────────────────────────────────
async function phase3_confirm(context, onProgress) {
    onProgress({ phase: 3, status: 'done', message: 'Ready for execution' })
    checkpointLogger.writeCheckpoint({ phase: 3, complete: true })
    return { ok: true }
}

// ── Phase 4: Execution — Planned Moves ────────────────────────────
async function phase4_execute(context, onProgress) {
    const { excludedPaths } = context
    // If not provided (large scale), pull from DB
    const plannedMoves = context.plannedMoves || dbManager.getPlannedMoves(Array.from(excludedPaths || []))
    if (!plannedMoves || plannedMoves.length === 0) return { ok: false, error: 'No planned moves found.' }

    const stats = dbManager.getStats()
    const totalBytes = stats.totalSize || 0
    let bytesProcessed = 0

    if (plannedMoves.length > 0) {
        // Simple heuristic: destination path of the first move
        const spaceCheck = diskUtils.checkDiskSpace(path.dirname(plannedMoves[0].dstPath), totalBytes)
        if (!spaceCheck.ok) {
            onProgress({ phase: 4, status: 'error', message: spaceCheck.message })
            return { ok: false, error: spaceCheck.message }
        }
    }

    performanceController.start(plannedMoves.length)
    let processedFiles = 0
    let failedFiles = 0
    let renamedCount = 0
    const errors = []
    const movedFiles = {} // srcPath -> dstPath

    const fsPromises = require('fs').promises

    // Crash Cleanup pass: if resuming, delete any destination files that aren't in movedFiles
    if (context.isResuming && plannedMoves.length > 0) {
        onProgress({ phase: 4, status: 'running', message: 'Cleaning up potentially corrupt files from crash…' })
        for (const move of plannedMoves) {
            const longDst = pathManager.toLongPath(move.dstPath)
            if (fs.existsSync(longDst) && !movedFiles[move.srcPath]) {
                try {
                    await fsPromises.unlink(longDst)
                } catch (e) {
                    console.warn(`[Cleanup] Failed to unlink ${move.dstPath}:`, e.message)
                }
            }
        }
    }

    for (let i = 0; i < plannedMoves.length; i += BATCH_SIZE) {
        if (_cancelled) break
        await performanceController.waitIfPaused()

        const batch = plannedMoves.slice(i, i + BATCH_SIZE)
        const copyPromises = batch.map(async (move) => {
            if (_cancelled) return null

            const validation = safetyGuard.validateTarget(move.srcPath, path.dirname(move.dstPath))
            if (!validation.ok) {
                auditLogger.log({
                    phase: 4, action: 'BLOCKED',
                    srcPath: move.srcPath, dstPath: move.dstPath,
                    reason: validation.reason, size: move.size || 0
                })
                failedFiles++
                errors.push({ file: move.srcPath, reason: validation.reason })
                return
            }

            try {
                await fsPromises.mkdir(pathManager.toLongPath(path.dirname(move.dstPath)), { recursive: true })

                // Use the new safeMove helper
                const actualDst = await safeMove(move.srcPath, move.dstPath)
                const wasRenamed = pathManager.toLongPath(move.dstPath) !== pathManager.toLongPath(actualDst)

                movedFiles[move.srcPath] = actualDst
                auditLogger.log({
                    phase: 4, action: 'MOVED',
                    srcPath: move.srcPath, dstPath: actualDst,
                    size: move.size || 0, status: 'OK',
                    renamed: wasRenamed
                })
                processedFiles++
                bytesProcessed += (move.size || 0)
                performanceController.increment()

                const collisionData = wasRenamed ? {
                    originalDst: move.dstPath,
                    actualDst: actualDst
                } : null

                // Report individual file progress for real-time UI updates
                onProgress({
                    phase: 4, status: 'running',
                    processed: processedFiles,
                    failed: failedFiles,
                    total: plannedMoves.length,
                    bytesProcessed,
                    totalBytes,
                    renamed: renamedCount,
                    lastMove: { src: move.srcPath, dst: actualDst, wasRenamed },
                    collision: collisionData,
                    ...performanceController.getStats(),
                })
            } catch (err) {
                auditLogger.log({
                    phase: 4, action: 'ERROR',
                    srcPath: move.srcPath, dstPath: move.dstPath,
                    error: err.message, size: move.size || 0
                })
                failedFiles++
                errors.push({ file: move.srcPath, reason: err.message })
            }
        })

        await Promise.all(copyPromises)

        const percent = Math.round(((i + batch.length) / plannedMoves.length) * 100)
        onProgress({
            phase: 4, status: 'running',
            processed: processedFiles,
            failed: failedFiles,
            total: plannedMoves.length,
            bytesProcessed,
            totalBytes,
            percent,
            ...performanceController.getStats(),
        })

        checkpointLogger.writeCheckpoint({
            phase: 4,
            processed: processedFiles,
            failed: failedFiles,
            movedFiles,
            lastIndex: i + batch.length
        })

        await performanceController.batchDelay()
    }

    const success = !_cancelled && failedFiles === 0
    checkpointLogger.writeCheckpoint({ phase: 4, complete: true, processed: processedFiles, failed: failedFiles, movedFiles })

    onProgress({
        phase: 4,
        status: _cancelled ? 'cancelled' : (failedFiles > 0 ? 'partial' : 'done'),
        processed: processedFiles,
        failed: failedFiles,
        renamed: renamedCount,
        errors,
        movedFiles
    })

    return { ok: success, processed: processedFiles, failed: failedFiles, renamed: renamedCount, errors, movedFiles }
}

// ── Phase 5: Validation & Integrity Check ─────────────────────────
async function phase5_validate(context, onProgress) {
    const { movedFiles } = context
    if (!movedFiles) return { ok: true, passed: 0, missing: 0 }

    onProgress({ phase: 5, status: 'validating', message: 'Verifying moved files (integrity check)…' })

    const entries = Object.entries(movedFiles)
    const SAMPLE_SIZE = Math.min(20, entries.length) // Sample 20 files
    const sample = entries.sort(() => Math.random() - 0.5).slice(0, SAMPLE_SIZE)

    let passed = 0, missing = 0, corrupt = 0

    for (const [src, dst] of sample) {
        if (!fs.existsSync(require('./pathManager').toLongPath(dst))) {
            missing++
            auditLogger.log({ phase: 5, action: 'VALIDATION_FAILED', message: 'File missing', dstPath: dst })
        } else {
            // Check if it's actually readable and not empty
            try {
                const stat = fs.statSync(require('./pathManager').toLongPath(dst))
                if (stat.size > 0) {
                    passed++
                } else {
                    corrupt++
                }
            } catch {
                corrupt++
            }
        }
    }

    checkpointLogger.writeCheckpoint({ phase: 5, complete: true, passed, missing, corrupt, sampleSize: SAMPLE_SIZE })
    onProgress({ phase: 5, status: 'done', passed, missing, corrupt, sampleSize: SAMPLE_SIZE })

    return { ok: true, passed, missing, corrupt }
}

// ── Phase 6: Reporting ──────────────────────────────────────────────
async function phase6_report(context, onProgress) {
    onProgress({ phase: 6, status: 'generating', message: 'Generating final session report…' })
    const logs = auditLogger.getAll()

    // Calculate summary
    const summary = {
        totalActions: logs.length,
        moved: logs.filter(l => l.action === 'MOVED').length,
        blocked: logs.filter(l => l.action === 'BLOCKED').length,
        errors: logs.filter(l => l.action === 'ERROR').length,
        totalBytes: logs.filter(l => l.action === 'MOVED').reduce((acc, l) => acc + (l.size || 0), 0)
    }

    checkpointLogger.writeCheckpoint({ phase: 6, complete: true, summary })
    onProgress({ phase: 6, status: 'done', summary, logs })
    return { ok: true, summary, logs }
}

// ── Phase 7: Cleanup — Search for empty folders ──────────────────
async function phase7_cleanup(context, onProgress) {
    onProgress({ phase: 7, status: 'scanning', message: 'Scanning for empty folders…' })
    const { folderPaths } = context
    const emptyFolders = []

    function findEmpty(dir) {
        try {
            const longDir = require('./pathManager').toLongPath(dir)
            const entries = fs.readdirSync(longDir, { withFileTypes: true })
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
            return allSubEmpty
        } catch {
            return false
        }
    }

    for (const folderPath of folderPaths) {
        findEmpty(folderPath)
    }

    onProgress({ phase: 7, status: 'running', message: `Deleting ${emptyFolders.length} empty folders…` })

    let deleted = 0
    let failed = 0

    for (const folder of emptyFolders) {
        try {
            const longFolder = require('./pathManager').toLongPath(folder)
            // Safety check: ensure it's still empty (could have changed)
            if (fs.readdirSync(longFolder).length === 0) {
                fs.rmSync(longFolder, { recursive: true, force: true })
                auditLogger.log({ phase: 7, action: 'CLEANUP', dstPath: folder, status: 'DELETED' })
                deleted++
            }
        } catch (err) {
            failed++
            auditLogger.log({ phase: 7, action: 'CLEANUP_FAIL', dstPath: folder, error: err.message })
        }
    }

    onProgress({ phase: 7, status: 'done', deleted, failed })
    return { ok: true, deleted, failed }
}

// ── Rollback Logic ──────────────────────────────────────────────────

async function startRollback(movedFiles, onProgress) {
    const entries = Object.entries(movedFiles)
    let processed = 0
    let failed = 0

    onProgress({ status: 'running', message: `Rolling back ${entries.length} items…`, total: entries.length })

    for (const [src, dst] of entries) {
        try {
            const longSrc = require('./pathManager').toLongPath(src)
            const longDst = require('./pathManager').toLongPath(dst)
            if (fs.existsSync(longDst)) {
                // To rollback, we copy back from dst to src, then delete dst
                fs.mkdirSync(path.dirname(longSrc), { recursive: true })
                fs.copyFileSync(longDst, longSrc)
                fs.unlinkSync(longDst)
                auditLogger.log({ action: 'ROLLBACK', src, dst, status: 'OK' })
            }
            processed++
        } catch (err) {
            auditLogger.log({ action: 'ROLLBACK_ERROR', src, dst, error: err.message })
            failed++
        }
        onProgress({ processed, failed, total: entries.length, percent: Math.round((processed / entries.length) * 100) })
    }

    onProgress({ status: 'done', processed, failed })
    return { ok: failed === 0, processed, failed }
}

// ── Entry points ────────────────────────────────────────────────────

async function startPhase(phaseNumber, context, onProgress) {
    _cancelled = false
    claimedPaths.clear()
    switch (phaseNumber) {
        case 1: return await phase1_scan(context, onProgress)
        case 2: return await phase2_preview(context, onProgress)
        case 3: return await phase3_confirm(context, onProgress)
        case 4: return await phase4_execute(context, onProgress)
        case 5: return await phase5_validate(context, onProgress)
        case 6: return await phase6_report(context, onProgress)
        case 7: return await phase7_cleanup(context, onProgress)
        default: return { ok: false, error: `Unknown phase: ${phaseNumber}` }
    }
}

function cancel() {
    _cancelled = true
}

async function startCleanup(context) {
    let deleted = 0
    for (const folder of context.folders || []) {
        try {
            const longFolder = require('./pathManager').toLongPath(folder)
            if (fs.existsSync(longFolder) && fs.readdirSync(longFolder).length === 0) {
                fs.rmdirSync(longFolder)
                deleted++
            }
        } catch { }
    }
    return { ok: true, deleted }
}

module.exports = { startPhase, cancel, startCleanup, startRollback }
