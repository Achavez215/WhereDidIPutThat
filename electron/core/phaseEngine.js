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

const BATCH_SIZE = 50
let _cancelled = false

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
    onProgress({ phase: 2, status: 'preview', message: 'Building category breakdown…' })
    const stats = fileScanner.buildStats(context.manifest)
    checkpointLogger.writeCheckpoint({ phase: 2, complete: true, stats })
    onProgress({ phase: 2, status: 'done', stats })
    return { ok: true, stats }
}

// ── Phase 3: Backup Creation ───────────────────────────────────────
async function phase3_backup(context, onProgress) {
    // Delegate to backupManager — handled via IPC directly
    // This phase just marks checkpoint
    checkpointLogger.writeCheckpoint({ phase: 3, complete: true, backupPath: context.backupPath })
    onProgress({ phase: 3, status: 'done', backupPath: context.backupPath })
    return { ok: true, backupPath: context.backupPath }
}

// ── Phase 4: Execution — Copy → Verify → Delete ────────────────────
async function phase4_execute(context, onProgress) {
    const { manifest, destinationMap } = context
    if (!manifest || !destinationMap) return { ok: false, error: 'Missing manifest or destination map.' }

    performanceController.start(manifest.length)
    let processed = 0
    let failed = 0
    const errors = []

    for (let i = 0; i < manifest.length; i += BATCH_SIZE) {
        if (_cancelled) break
        await performanceController.waitIfPaused()

        const batch = manifest.slice(i, i + BATCH_SIZE)

        for (const file of batch) {
            if (_cancelled) break

            const dstFolder = destinationMap[file.category]
            if (!dstFolder) {
                auditLogger.log({ phase: 4, action: 'SKIP', srcPath: file.srcPath, reason: 'No destination mapped' })
                continue
            }

            const validation = safetyGuard.validateTarget(file.srcPath, dstFolder)
            if (!validation.ok) {
                auditLogger.log({ phase: 4, action: 'BLOCKED', srcPath: file.srcPath, reason: validation.reason })
                failed++
                errors.push({ file: file.srcPath, reason: validation.reason })
                continue
            }

            // Ensure destination folder exists
            try { fs.mkdirSync(dstFolder, { recursive: true }) } catch { }

            const dstPath = safeUniqueDestination(file.srcPath, dstFolder)

            try {
                // Step 1: Copy
                fs.copyFileSync(file.srcPath, dstPath)

                // Step 2: Verify size integrity
                const srcStat = fs.statSync(file.srcPath)
                const dstStat = fs.statSync(dstPath)
                if (srcStat.size !== dstStat.size) {
                    fs.unlinkSync(dstPath) // remove bad copy
                    throw new Error(`Size mismatch: ${srcStat.size} vs ${dstStat.size}`)
                }

                // Step 3: Delete original
                fs.unlinkSync(file.srcPath)

                auditLogger.log({
                    phase: 4, action: 'MOVED',
                    srcPath: file.srcPath, dstPath,
                    size: file.size, status: 'OK',
                })
                processed++
                performanceController.increment()
            } catch (err) {
                auditLogger.log({ phase: 4, action: 'ERROR', srcPath: file.srcPath, dstPath, error: err.message })
                failed++
                errors.push({ file: file.srcPath, reason: err.message })
            }
        }

        onProgress({
            phase: 4, status: 'running',
            processed, failed, total: manifest.length,
            percent: Math.round(((i + batch.length) / manifest.length) * 100),
            ...performanceController.getStats(),
        })

        checkpointLogger.writeCheckpoint({ phase: 4, processed, failed, lastBatch: i })
        await performanceController.batchDelay()
    }

    const success = !_cancelled
    checkpointLogger.writeCheckpoint({ phase: 4, complete: true, processed, failed })
    onProgress({ phase: 4, status: _cancelled ? 'cancelled' : 'done', processed, failed, errors })
    return { ok: success, processed, failed, errors }
}

// ── Phase 5: Validation & Integrity Check ─────────────────────────
async function phase5_validate(context, onProgress) {
    const { manifest, destinationMap } = context
    if (!manifest) return { ok: false, error: 'No manifest for validation.' }

    onProgress({ phase: 5, status: 'validating', message: 'Sampling moved files…' })

    const SAMPLE_SIZE = Math.min(50, manifest.length)
    const sample = manifest.sort(() => Math.random() - 0.5).slice(0, SAMPLE_SIZE)
    let passed = 0, missing = 0

    for (const file of sample) {
        const dstFolder = destinationMap?.[file.category]
        if (!dstFolder) continue
        // Check that it arrived at destination (by name — we don't track exact dst path here)
        const expectedName = path.basename(file.srcPath)
        const expectedPath = path.join(dstFolder, expectedName)
        if (fs.existsSync(expectedPath)) {
            passed++
        } else {
            missing++
        }
    }

    checkpointLogger.writeCheckpoint({ phase: 5, complete: true, passed, missing, sampleSize: SAMPLE_SIZE })
    onProgress({ phase: 5, status: 'done', passed, missing, sampleSize: SAMPLE_SIZE })
    return { ok: true, passed, missing }
}

// ── Phase 6: Final Report Generation ──────────────────────────────
async function phase6_report(context, onProgress) {
    const logs = auditLogger.getAll()
    const moved = logs.filter(l => l.action === 'MOVED').length
    const blocked = logs.filter(l => l.action === 'BLOCKED').length
    const errors = logs.filter(l => l.action === 'ERROR').length
    const skipped = logs.filter(l => l.action === 'SKIP').length

    const report = { moved, blocked, errors, skipped, total: logs.length, generatedAt: new Date().toISOString() }

    checkpointLogger.writeCheckpoint({ phase: 6, complete: true, report })
    onProgress({ phase: 6, status: 'done', report })
    return { ok: true, report }
}

// ── Cancel ─────────────────────────────────────────────────────────
function cancel() {
    _cancelled = true
    performanceController.resume() // unblock pause if cancelled while paused
    return { ok: true }
}

// ── Helpers ────────────────────────────────────────────────────────
function safeUniqueDestination(srcPath, dstFolder) {
    const base = path.basename(srcPath)
    let dstPath = path.join(dstFolder, base)
    if (!fs.existsSync(dstPath)) return dstPath
    // Resolve collision by appending counter
    const ext = path.extname(base)
    const name = path.basename(base, ext)
    let counter = 1
    while (fs.existsSync(dstPath)) {
        dstPath = path.join(dstFolder, `${name}_${counter}${ext}`)
        counter++
    }
    return dstPath
}

module.exports = { startPhase, cancel }
