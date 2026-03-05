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
        CREATE TABLE files (
            id TEXT PRIMARY KEY,
            name TEXT,
            ext TEXT,
            category TEXT,
            srcPath TEXT UNIQUE,
            size INTEGER,
            modified INTEGER,
            suggestedDst TEXT
        )
    `);

    // Index for faster category-based UI pagination
    db.exec(`CREATE INDEX idx_files_category ON files(category)`);
}

/**
 * insertFiles(filesArray)
 * Batch inserts file entries using a transaction for speed.
 */
function insertFiles(filesArray) {
    if (!db) return;

    const insert = db.prepare(`
        INSERT OR IGNORE INTO files 
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
    db.prepare('UPDATE files SET suggestedDst = ? WHERE id = ?').run(dst, fileId);
}

/**
 * getPlannedMoves()
 * Returns all files that have a suggested destination, ready for Phase 4.
 */
function getPlannedMoves() {
    if (!db) return [];
    return db.prepare('SELECT * FROM files WHERE suggestedDst IS NOT NULL AND suggestedDst != ""').all();
}

/**
 * getFilesByCategory(category, limit, offset)
 * Returns a slice of files for paginated UI display.
 */
function getFilesByCategory(category, limit = 50, offset = 0) {
    if (!db) return [];

    if (category === 'all') {
        return db.prepare('SELECT * FROM files LIMIT ? OFFSET ?').all(limit, offset);
    }

    return db.prepare('SELECT * FROM files WHERE category = ? LIMIT ? OFFSET ?')
        .all(category, limit, offset);
}

/**
 * getAllFiles()
 * Use with caution: returns ALL files for processing phases (batching recommended).
 */
function getAllFiles() {
    if (!db) return [];
    return db.prepare('SELECT * FROM files').all();
}

/**
 * getTotalStats()
 * Returns aggregate counts and sizes per category.
 */
function getTotalStats() {
    if (!db) return [];

    const results = db.prepare(`
        SELECT category, COUNT(*) as count, SUM(size) as totalSize 
        FROM files GROUP BY category
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
    insertFiles,
    getFilesByCategory,
    getAllFiles,
    getTotalStats,
    clearDb
};
