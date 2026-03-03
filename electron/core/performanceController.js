/**
 * performanceController.js
 * Controls batch pacing, pause/resume, and exposes perf metrics.
 */

const os = require('os')

let _paused = false
let _startTime = null
let _processed = 0
let _total = 0

const BATCH_DELAY_MS = 50   // ms between batches (reduces CPU spikes)

function start(total) {
    _paused = false
    _startTime = Date.now()
    _processed = 0
    _total = total
}

function pause() {
    _paused = true
    return { ok: true }
}

function resume() {
    _paused = false
    return { ok: true }
}

function isPaused() {
    return _paused
}

function increment(n = 1) {
    _processed += n
}

/**
 * waitIfPaused() — Call at the top of each batch loop.
 * Returns a promise that resolves only when not paused.
 */
function waitIfPaused() {
    return new Promise(resolve => {
        const check = () => {
            if (!_paused) return resolve()
            setTimeout(check, 300)
        }
        check()
    })
}

/**
 * batchDelay() — Inserts a short delay between batches.
 */
function batchDelay() {
    return new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
}

/**
 * getStats() → { cpuLoad, memUsedMB, memTotalMB, processed, total, etaSeconds }
 */
function getStats() {
    const memTotalMB = Math.round(os.totalmem() / 1024 / 1024)
    const memUsedMB = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024)

    let etaSeconds = null
    if (_startTime && _processed > 0 && _total > 0) {
        const elapsed = (Date.now() - _startTime) / 1000
        const rate = _processed / elapsed
        const remaining = _total - _processed
        etaSeconds = rate > 0 ? Math.round(remaining / rate) : null
    }

    return {
        memUsedMB,
        memTotalMB,
        memPercent: Math.round((memUsedMB / memTotalMB) * 100),
        processed: _processed,
        total: _total,
        etaSeconds,
        paused: _paused,
    }
}

module.exports = { start, pause, resume, isPaused, increment, waitIfPaused, batchDelay, getStats }
