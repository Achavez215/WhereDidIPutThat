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
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(updated, null, 2), 'utf8')
}

function readCheckpoint() {
    try {
        if (!fs.existsSync(CHECKPOINT_FILE)) return null
        const raw = fs.readFileSync(CHECKPOINT_FILE, 'utf8')
        return JSON.parse(raw)
    } catch {
        return null
    }
}

function clearCheckpoint() {
    try {
        if (fs.existsSync(CHECKPOINT_FILE)) {
            fs.unlinkSync(CHECKPOINT_FILE)
        }
        return { ok: true }
    } catch (err) {
        return { ok: false, error: err.message }
    }
}

module.exports = { writeCheckpoint, readCheckpoint, clearCheckpoint }
