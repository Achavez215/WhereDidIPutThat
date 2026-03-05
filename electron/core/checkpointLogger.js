/**
 * checkpointLogger.js
 * Writes & reads phase checkpoint files to survive crashes.
 * Location: [App Data]/WhereDidIPutThat/checkpoints/session_checkpoint.json
 */

const fs = require('fs')
const path = require('path')
const pathManager = require('./pathManager')

// Defer path resolution until called, since app.getPath('userData')
// requires the Electron app to be 'ready'.
let _checkpointFile = null
function getFile() {
    if (!_checkpointFile) _checkpointFile = pathManager.getCheckpointFile()
    return _checkpointFile
}

function writeCheckpoint(data) {
    const file = getFile()
    const existing = readCheckpoint() || {}
    const updated = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
    }
    const dir = path.dirname(file)
    const longDir = pathManager.toLongPath(dir)
    const longFile = pathManager.toLongPath(file)
    const longTempFile = pathManager.toLongPath(file + '.tmp')

    if (!fs.existsSync(longDir)) fs.mkdirSync(longDir, { recursive: true })

    // Atomic write: Write to temp file first, then rename
    fs.writeFileSync(longTempFile, JSON.stringify(updated, null, 2), 'utf8')
    fs.renameSync(longTempFile, longFile)
}

function readCheckpoint() {
    try {
        const file = getFile()
        const longFile = pathManager.toLongPath(file)
        if (!fs.existsSync(longFile)) return null
        const raw = fs.readFileSync(longFile, 'utf8')
        return JSON.parse(raw)
    } catch {
        return null
    }
}

function clearCheckpoint() {
    try {
        const file = getFile()
        const longFile = pathManager.toLongPath(file)
        if (fs.existsSync(longFile)) {
            fs.unlinkSync(longFile)
        }
        return { ok: true }
    } catch (err) {
        return { ok: false, error: err.message }
    }
}

module.exports = { writeCheckpoint, readCheckpoint, clearCheckpoint }
