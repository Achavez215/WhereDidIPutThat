const Database = require('better-sqlite3');
const pathManager = require('./pathManager');
const path = require('path');
const fs = require('fs');

let db;

/**
 * initDb()
 * Re-initializes the scan database for a fresh session.
 */
function initDb() {
    const dbPath = path.join(pathManager.getAppDataPath(), 'current_scan.db');

    // Ensure parent directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    if (fs.existsSync(dbPath)) {
        try {
            if (db) db.close();
            fs.unlinkSync(dbPath);
        } catch (e) {
            console.warn('Could not reset existing DB, trying to continue:', e.message);
        }
    }

    db = new Database(dbPath);

    // Performance optimizations
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS manifest (
            id TEXT PRIMARY KEY,
            name TEXT,
            ext TEXT,
            category TEXT,
            srcPath TEXT UNIQUE,
            size INTEGER,
            modified INTEGER,
            suggestedDst TEXT,
            actualDst TEXT,
            collisionHandled INTEGER DEFAULT 0,
            isDuplicate INTEGER DEFAULT 0
        )
    `);

    // Index for faster category-based UI pagination
    db.exec(`CREATE INDEX IF NOT EXISTS idx_manifest_category ON manifest(category)`);
}

/**
 * insertBatch(filesArray)
 * Batch inserts file entries using a transaction for speed.
 */
function insertBatch(filesArray) {
    if (!db) return;

    const insert = db.prepare(`
        INSERT OR IGNORE INTO manifest 
        (id, name, ext, category, srcPath, size, modified) 
        VALUES (@id, @name, @ext, @category, @srcPath, @size, @modified)
    `);

    const transaction = db.transaction((files) => {
        for (const file of files) insert.run(file);
    });

    transaction(filesArray);
}

/**
 * updateSuggestedDst(fileId, dst)
 * Updates the target destination for a specific file.
 */
function updateSuggestedDst(fileId, dst) {
    if (!db) return;
    db.prepare('UPDATE manifest SET suggestedDst = ? WHERE id = ?').run(dst, fileId);
}

function updateIsDuplicate(fileId, val) {
    if (!db) return;
    db.prepare('UPDATE manifest SET isDuplicate = ? WHERE id = ?').run(val, fileId);
}

/**
 * getPlannedMoves()
 * Returns all files that have a suggested destination, ready for Phase 4.
 */
function getPlannedMoves() {
    if (!db) return [];
    return db.prepare('SELECT * FROM manifest WHERE suggestedDst IS NOT NULL AND suggestedDst != ""').all();
}

/**
 * getFiles(category, limit, offset)
 * Returns a slice of files for paginated UI display.
 */
function getFiles(category = 'all', limit = 50, offset = 0) {
    if (!db) return [];

    if (category === 'all') {
        return db.prepare('SELECT * FROM manifest ORDER BY size DESC LIMIT ? OFFSET ?').all(limit, offset);
    }

    return db.prepare('SELECT * FROM manifest WHERE category = ? ORDER BY size DESC LIMIT ? OFFSET ?')
        .all(category, limit, offset);
}

/**
 * getAllFiles()
 * Use with caution: returns ALL files for processing phases (batching recommended).
 */
function getAllFiles() {
    if (!db) return [];
    return db.prepare('SELECT * FROM manifest').all();
}

/**
 * getStats()
 * Returns aggregate counts and sizes per category.
 */
function getStats() {
    if (!db) return { total: 0, totalSize: 0, byCategory: {} };

    const results = db.prepare(`
        SELECT category, COUNT(*) as count, SUM(size) as totalSize 
        FROM manifest GROUP BY category
    `).all();

    const byCategory = {};
    let total = 0;
    let totalSize = 0;

    results.forEach(row => {
        byCategory[row.category] = row.count;
        total += row.count;
        totalSize += row.totalSize || 0;
    });

    return { total, totalSize, byCategory };
}

/**
 * clearDb()
 * Closes and removes the database file.
 */
function clearDb() {
    if (db) {
        db.close();
        db = null;
    }
    const dbPath = path.join(pathManager.getAppDataPath(), 'current_scan.db');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

module.exports = {
    initDb,
    insertBatch,
    getFiles,
    getAllFiles,
    getStats,
    updateSuggestedDst,
    updateIsDuplicate,
    getPlannedMoves,
    clearDb
};
