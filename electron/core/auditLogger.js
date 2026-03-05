/**
 * auditLogger.js
 * Appends structured JSON lines to an audit log file.
 * Each entry records every file action with full metadata.
 */

const fs = require('fs')
const path = require('path')
const pathManager = require('./pathManager')

// Defer path resolution until called
let _logFile = null
function getFile() {
    if (!_logFile) _logFile = pathManager.getLogFile()
    return _logFile
}

const MAX_LOG_BYTES = 5 * 1024 * 1024 // 5 MB

let logCounter = 0
const ROTATION_CHECK_INTERVAL = 100

function ensureDir() {
    // pathManager handles dir creation
}

function rotateLogs() {
    try {
        const file = getFile()
        const longFile = pathManager.toLongPath(file)
        const stat = fs.existsSync(longFile) ? fs.statSync(longFile) : null
        if (stat && stat.size > MAX_LOG_BYTES) {
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
            const archivePath = file.replace('.jsonl', `_${ts}.jsonl`)
            fs.renameSync(longFile, pathManager.toLongPath(archivePath))
        }
    } catch { }
}

/**
 * log(entry) — Appends a single audit entry without blocking the main thread.
 */
function log(entry) {
    ensureDir()

    // Only check rotation every 100 calls to save disk I/O
    if (++logCounter >= ROTATION_CHECK_INTERVAL) {
        logCounter = 0
        rotateLogs()
    }

    const line = JSON.stringify({
        ts: new Date().toISOString(),
        ...entry,
    }) + '\n'

    const file = getFile()
    // Fire and forget async write
    fs.promises.appendFile(pathManager.toLongPath(file), line, 'utf8')
        .catch(err => console.error('Audit log write failed:', err))
}

/**
 * getAll() → Array of parsed log entries
 */
function getAll() {
    try {
        const file = getFile()
        const longLog = pathManager.toLongPath(file)
        if (!fs.existsSync(longLog)) return []
        const raw = fs.readFileSync(longLog, 'utf8')
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
        const longFile = pathManager.toLongPath(filePath)
        if (format === 'json') {
            fs.writeFileSync(longFile, JSON.stringify(entries, null, 2), 'utf8')
        } else if (format === 'csv') {
            const headers = ['ts', 'phase', 'action', 'srcPath', 'dstPath', 'size', 'status', 'error']
            const rows = entries.map(e =>
                headers.map(h => JSON.stringify(e[h] ?? '')).join(',')
            )
            fs.writeFileSync(longFile, [headers.join(','), ...rows].join('\n'), 'utf8')
        } else if (format === 'html') {
            const rows = entries.map(e => `
                <tr>
                    <td>${e.ts || ''}</td>
                    <td>${e.phase || ''}</td>
                    <td class="action-${(e.action || '').toLowerCase()}">${e.action || ''}</td>
                    <td title="${e.srcPath || ''}">${e.srcPath ? e.srcPath.split(/[\\/]/).pop() : ''}</td>
                    <td title="${e.dstPath || ''}">${e.dstPath ? e.dstPath.split(/[\\/]/).pop() : ''}</td>
                    <td>${e.size ? (e.size / 1024).toFixed(1) + ' KB' : ''}</td>
                    <td>${e.error || e.reason || ''}</td>
                </tr>`).join('')
            const moved = entries.filter(e => e.action === 'MOVED').length
            const blocked = entries.filter(e => e.action === 'BLOCKED').length
            const errors = entries.filter(e => e.action === 'ERROR').length
            const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>WhereDidIPutThat — Audit Report</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 2rem; }
  h1 { color: #58a6ff; } h2 { color: #8b949e; font-weight: normal; }
  .summary { display: flex; gap: 2rem; margin: 1.5rem 0; }
  .stat { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1rem 1.5rem; text-align: center; }
  .stat .n { font-size: 2rem; font-weight: bold; }
  .stat.moved .n { color: #3fb950; } .stat.blocked .n { color: #f85149; } .stat.error .n { color: #d29922; }
  table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; font-size: 0.875rem; }
  th { background: #161b22; color: #8b949e; text-align: left; padding: 0.6rem 1rem; border-bottom: 1px solid #30363d; }
  td { padding: 0.5rem 1rem; border-bottom: 1px solid #21262d; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  tr:hover td { background: #161b22; }
  .action-moved { color: #3fb950; } .action-blocked { color: #f85149; } .action-error { color: #d29922; } .action-skip { color: #8b949e; }
</style>
</head>
<body>
<h1>WhereDidIPutThat — Audit Report</h1>
<h2>Generated: ${new Date().toLocaleString()}</h2>
<div class="summary">
  <div class="stat moved"><div class="n">${moved}</div><div>Moved</div></div>
  <div class="stat blocked"><div class="n">${blocked}</div><div>Blocked</div></div>
  <div class="stat error"><div class="n">${errors}</div><div>Errors</div></div>
  <div class="stat"><div class="n">${entries.length}</div><div>Total Actions</div></div>
</div>
<table>
  <thead><tr><th>Timestamp</th><th>Phase</th><th>Action</th><th>File</th><th>Destination</th><th>Size</th><th>Note</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`
            fs.writeFileSync(require('./pathManager').toLongPath(filePath), html, 'utf8')
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
        const file = getFile()
        const longLog = pathManager.toLongPath(file)
        if (fs.existsSync(longLog)) fs.unlinkSync(longLog)
        return { ok: true }
    } catch (err) {
        return { ok: false, error: err.message }
    }
}

module.exports = { log, getAll, exportReport, clearLog, getLogFile: getFile }
