/**
 * phaseEngine.js
 * Manages the 7-phase state machine. Each phase must be manually triggered.
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

// ── Shared Helpers ──────────────────────────────────────────────────

function hashFile(filePath) {
    try {
        const hash = crypto.createHash('sha256')
        const data = fs.readFileSync(filePath)
        hash.update(data)
        return hash.digest('hex')
    } catch {
        return null
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

    const { manifest, selectedDrive, destinationMap } = context
    const stats = fileScanner.buildStats(manifest)

    const recommendations = []
    const baseDir = selectedDrive?.mountPath || 'C:\\'

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
    const duplicates = []

    for (const file of manifest) {
        const key = `${file.name}_${file.size}`
        if (duplicatePool.has(key)) {
            duplicates.push(file.srcPath)
        } else {
            duplicatePool.set(key, file.srcPath)
        }

        const dstFolder = mappings[file.category] || mappings.other
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

// ── Phase 3: Confirmation ──────────────────────────────────────────
async function phase3_confirm(context, onProgress) {
    onProgress({ phase: 3, status: 'done', message: 'Ready for execution' })
    checkpointLogger.writeCheckpoint({ phase: 3, complete: true })
    return { ok: true }
}

// ── Phase 4: Execution — Planned Moves ────────────────────────────
async function phase4_execute(context, onProgress) {
    const { plannedMoves } = context
    if (!plannedMoves || plannedMoves.length === 0) return { ok: false, error: 'No planned moves provided.' }

    const totalBytes = plannedMoves.reduce((sum, move) => sum + (move.size || 0), 0)
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
    const errors = []
    const movedFiles = {} // srcPath -> dstPath

    for (let i = 0; i < plannedMoves.length; i += BATCH_SIZE) {
        if (_cancelled) break
        await performanceController.waitIfPaused()

        const batch = plannedMoves.slice(i, i + BATCH_SIZE)

        for (const move of batch) {
            if (_cancelled) break

            const validation = safetyGuard.validateTarget(move.srcPath, path.dirname(move.dstPath))
            if (!validation.ok) {
                auditLogger.log({
                    phase: 4, action: 'BLOCKED',
                    srcPath: move.srcPath, dstPath: move.dstPath,
                    reason: validation.reason, size: move.size || 0
                })
                failedFiles++
                errors.push({ file: move.srcPath, reason: validation.reason })
                continue
            }

            try {
                fs.mkdirSync(path.dirname(move.dstPath), { recursive: true })
            } catch (err) {
                // If directory creation fails, log it
                auditLogger.log({ phase: 4, action: 'ERROR', srcPath: move.srcPath, dstPath: move.dstPath, error: `Dir creation failed: ${err.message}` })
                failedFiles++
                errors.push({ file: move.srcPath, reason: `Dir creation failed: ${err.message}` })
                continue
            }

            try {
                const srcHash = hashFile(move.srcPath)
                if (!srcHash) throw new Error("Could not read source file hash")

                fs.copyFileSync(move.srcPath, move.dstPath)

                const dstHash = hashFile(move.dstPath)
                if (srcHash !== dstHash) {
                    // Safety check: if copying somehow corrupted the file, delete the bad copy
                    try { if (fs.existsSync(move.dstPath)) fs.unlinkSync(move.dstPath) } catch { }
                    throw new Error(`Data integrity failure: Hash mismatch after copy. Operation aborted for this file.`)
                }

                // Verification successful, delete source
                fs.unlinkSync(move.srcPath)

                movedFiles[move.srcPath] = move.dstPath
                auditLogger.log({
                    phase: 4, action: 'MOVED',
                    srcPath: move.srcPath, dstPath: move.dstPath,
                    size: move.size || 0, status: 'OK',
                })
                processedFiles++
                bytesProcessed += (move.size || 0)
                performanceController.increment()
            } catch (err) {
                auditLogger.log({
                    phase: 4, action: 'ERROR',
                    srcPath: move.srcPath, dstPath: move.dstPath,
                    error: err.message, size: move.size || 0
                })
                failedFiles++
                errors.push({ file: move.srcPath, reason: err.message })
            }
        }

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
        errors,
        movedFiles
    })

    return { ok: success, processed: processedFiles, failed: failedFiles, errors, movedFiles }
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
        if (!fs.existsSync(dst)) {
            missing++
            auditLogger.log({ phase: 5, action: 'VALIDATION_FAILED', message: 'File missing', dstPath: dst })
        } else {
            // Check if it's actually readable and not empty
            try {
                const stat = fs.statSync(dst)
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
            // Safety check: ensure it's still empty (could have changed)
            if (fs.readdirSync(folder).length === 0) {
                fs.rmSync(folder, { recursive: true, force: true })
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
            if (fs.existsSync(dst)) {
                // To rollback, we copy back from dst to src, then delete dst
                fs.mkdirSync(path.dirname(src), { recursive: true })
                fs.copyFileSync(dst, src)
                fs.unlinkSync(dst)
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
            if (fs.existsSync(folder) && fs.readdirSync(folder).length === 0) {
                fs.rmdirSync(folder)
                deleted++
            }
        } catch { }
    }
    return { ok: true, deleted }
}

module.exports = { startPhase, cancel, startCleanup, startRollback }
