/**
 * auditLogger.js
 * Appends structured JSON lines to an audit log file.
 * Each entry records every file action with full metadata.
 */

const fs = require('fs')
const path = require('path')
const pathManager = require('./pathManager')

const LOG_FILE = pathManager.getLogFile()

function ensureDir() {
    // pathManager handles dir creation
}

/**
 * log(entry) — Appends a single audit entry as a JSON line.
 */
function log(entry) {
    ensureDir()
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        ...entry,
    }) + '\n'
    fs.appendFileSync(LOG_FILE, line, 'utf8')
}

/**
 * getAll() → Array of parsed log entries
 */
function getAll() {
    try {
        if (!fs.existsSync(LOG_FILE)) return []
        const raw = fs.readFileSync(LOG_FILE, 'utf8')
        return raw
            .split('\n')
            .filter(Boolean)
            .map(line => {
                try { return JSON.parse(line) } catch { return null }
            })
            .filter(Boolean)
    } catch {
        return []
    }
}

/**
 * exportReport(filePath, format) → { ok, filePath }
 */
function exportReport(filePath, format) {
    try {
        const entries = getAll()
        if (format === 'json') {
            fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf8')
        } else if (format === 'csv') {
            const headers = ['ts', 'phase', 'action', 'srcPath', 'dstPath', 'size', 'status', 'error']
            const rows = entries.map(e =>
                headers.map(h => JSON.stringify(e[h] ?? '')).join(',')
            )
            fs.writeFileSync(filePath, [headers.join(','), ...rows].join('\n'), 'utf8')
        }
        return { ok: true, filePath }
    } catch (err) {
        return { ok: false, error: err.message }
    }
}

/**
 * clearLog() — Clears the audit log (called on fresh session start if user confirms).
 */
function clearLog() {
    try {
        if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE)
        return { ok: true }
    } catch (err) {
        return { ok: false, error: err.message }
    }
}

module.exports = { log, getAll, exportReport, clearLog, LOG_FILE }
