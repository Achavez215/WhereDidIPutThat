/**
 * checkpointLogger.js
 * Writes & reads phase checkpoint files to survive crashes.
 * Location: %APPDATA%\FileOrganizer\checkpoint.json
 */

const fs = require('fs')
const path = require('path')
const pathManager = require('./pathManager')

const CHECKPOINT_FILE = pathManager.getCheckpointFile()

function ensureDir() {
    // pathManager handles dir creation
}

/**
 * writeCheckpoint(data) — Merges data into the existing checkpoint.
 * Called at the END of each successful phase / batch.
 */
function writeCheckpoint(data) {
    ensureDir()
    const existing = readCheckpoint() || {}
    const updated = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
    }
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(updated, null, 2), 'utf8')
}

/**
 * readCheckpoint() → object | null
 * Returns the checkpoint data, or null if none exists.
 */
function readCheckpoint() {
    try {
        if (!fs.existsSync(CHECKPOINT_FILE)) return null
        const raw = fs.readFileSync(CHECKPOINT_FILE, 'utf8')
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/**
 * clearCheckpoint() — Removes the checkpoint file after a clean run.
 */
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

module.exports = { writeCheckpoint, readCheckpoint, clearCheckpoint, CHECKPOINT_DIR }
