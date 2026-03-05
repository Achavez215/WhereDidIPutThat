/**
 * checkpointLogger.js
 * Writes & reads phase checkpoint files to survive crashes.
 * Location: [App Data]/WhereDidIPutThat/checkpoints/session_checkpoint.json
 */

const fs = require('fs')
const path = require('path')
const pathManager = require('./pathManager')

const CHECKPOINT_FILE = pathManager.getCheckpointFile()

function writeCheckpoint(data) {
    const existing = readCheckpoint() || {}
    const updated = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
    }
    const dir = path.dirname(CHECKPOINT_FILE)
    const longDir = pathManager.toLongPath(dir)
    const longFile = pathManager.toLongPath(CHECKPOINT_FILE)
    if (!fs.existsSync(longDir)) fs.mkdirSync(longDir, { recursive: true })
    fs.writeFileSync(longFile, JSON.stringify(updated, null, 2), 'utf8')
}

function readCheckpoint() {
    try {
        const longFile = pathManager.toLongPath(CHECKPOINT_FILE)
        if (!fs.existsSync(longFile)) return null
        const raw = fs.readFileSync(longFile, 'utf8')
        return JSON.parse(raw)
    } catch {
        return null
    }
}

function clearCheckpoint() {
    try {
        const longFile = pathManager.toLongPath(CHECKPOINT_FILE)
        if (fs.existsSync(longFile)) {
            fs.unlinkSync(longFile)
        }
        return { ok: true }
    } catch (err) {
        return { ok: false, error: err.message }
    }
}

module.exports = { writeCheckpoint, readCheckpoint, clearCheckpoint }
