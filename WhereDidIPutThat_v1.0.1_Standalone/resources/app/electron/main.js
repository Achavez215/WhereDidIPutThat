/**
 * main.js — WhereDidIPutThat
 * Electron main process entry point.
 *
 * IMPORTANT: Must be launched via the Electron binary, not node directly.
 * Run: .\node_modules\electron\dist\electron.exe .
 * Or:  npm run dev
 */

'use strict'

const { app, BrowserWindow, ipcMain, dialog, session, nativeTheme } = require('electron')
const path = require('path')

// Dev mode detection: env var set by npm scripts, or running from source (not asar)
const isDev = process.env.ELECTRON_IS_DEV === '1' || !__dirname.includes('app.asar')

const driveScanner = require(path.join(__dirname, 'core', 'driveScanner'))
const safetyGuard = require(path.join(__dirname, 'core', 'safetyGuard'))
const fileScanner = require(path.join(__dirname, 'core', 'fileScanner'))
const phaseEngine = require(path.join(__dirname, 'core', 'phaseEngine'))
const backupManager = require(path.join(__dirname, 'core', 'backupManager'))
const checkpointLogger = require(path.join(__dirname, 'core', 'checkpointLogger'))
const auditLogger = require(path.join(__dirname, 'core', 'auditLogger'))
const performanceController = require(path.join(__dirname, 'core', 'performanceController'))
const settingsManager = require(path.join(__dirname, 'core', 'settingsManager'))
const diskUtils = require(path.join(__dirname, 'core', 'diskUtils'))
const historyManager = require(path.join(__dirname, 'core', 'historyManager'))

let mainWindow = null

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#0b0d12',
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#0b0d12',
            symbolColor: '#8b949e',
            height: 36,
        },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
        },
    })

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173')
        mainWindow.webContents.on('did-finish-load', () => {
            mainWindow.webContents.openDevTools({ mode: 'detach' })
        })
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    mainWindow.on('closed', () => { mainWindow = null })

    // ── Navigation Guard: block all external navigation ──────────────
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const parsedUrl = new URL(url)
        const allowedOrigins = ['http://localhost:5173', 'file://']
        const isAllowed = allowedOrigins.some(o => url.startsWith(o))
        if (!isAllowed) {
            event.preventDefault()
            console.warn('[WhereDidIPutThat] Blocked navigation to:', parsedUrl.origin)
        }
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        console.warn('[WhereDidIPutThat] Blocked new window request to:', url)
        return { action: 'deny' }
    })
}

app.whenReady().then(() => {
    // ── Defer electron-updater init until app is ready ──────────────
    const { autoUpdater } = require('electron-updater')
    const electronLog = require('electron-log')
    autoUpdater.autoDownload = false
    autoUpdater.logger = electronLog
    autoUpdater.logger.transports.file.level = 'info'

    autoUpdater.on('update-available', () => {
        if (mainWindow) mainWindow.webContents.send('update:available')
    })
    autoUpdater.on('update-downloaded', () => {
        if (mainWindow) mainWindow.webContents.send('update:downloaded')
    })

    // ── Content Security Policy ───────────────────────────────────────
    // Dev mode: relaxed to allow Vite HMR, React inline scripts, Google Fonts
    // Production: strict — no external connections or inline scripts
    const CSP_DEV = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Vite + React preamble
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self' ws://localhost:5173 http://localhost:5173",  // Vite HMR
        "object-src 'none'",
        "base-uri 'none'",
    ].join('; ')

    const CSP_PROD = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
    ].join('; ')

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [isDev ? CSP_DEV : CSP_PROD],
            },
        })
    })

    createWindow()

    // ── OS Theme: expose to renderer ─────────────────────────────
    ipcMain.handle('theme:get', () => nativeTheme.shouldUseDarkColors)
    nativeTheme.on('updated', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors)
        }
    })

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

// ──────────────────────────────────────────────
// IPC Handlers — Drive & Folder
// ──────────────────────────────────────────────

ipcMain.handle('drives:list', () => driveScanner.listDrives())

ipcMain.handle('folder:listTopLevel', (_, drivePath) => driveScanner.listTopLevelFolders(drivePath))

ipcMain.handle('folder:browse', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Destination Folder',
    })
    return result.canceled ? null : result.filePaths[0]
})

// ──────────────────────────────────────────────
// IPC Handlers — Safety
// ──────────────────────────────────────────────

ipcMain.handle('safety:isProtected', (_, p) => safetyGuard.isProtected(p))
ipcMain.handle('safety:validateTarget', (_, src, dst) => safetyGuard.validateTarget(src, dst))

// ──────────────────────────────────────────────
// IPC Handlers — Phase Engine
// ──────────────────────────────────────────────

ipcMain.handle('phase:startPhase', async (event, phaseNumber, context) => {
    return phaseEngine.startPhase(phaseNumber, context, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('phase:progress', progress)
    })
})

ipcMain.handle('phase:pause', () => performanceController.pause())
ipcMain.handle('phase:resume', () => performanceController.resume())
ipcMain.handle('phase:cancel', (_, ctx) => phaseEngine.cancel(ctx))
ipcMain.handle('phase:startCleanup', (_, ctx) => phaseEngine.startCleanup(ctx))
ipcMain.handle('phase:checkCheckpoint', () => checkpointLogger.readCheckpoint())
ipcMain.handle('phase:clearCheckpoint', () => checkpointLogger.clearCheckpoint())

// ──────────────────────────────────────────────
// IPC Handlers — Backup
// ──────────────────────────────────────────────

ipcMain.handle('backup:create', async (event, files, destDrive) => {
    return backupManager.createBackup(files, destDrive, (p) => {
        if (!event.sender.isDestroyed()) event.sender.send('backup:progress', p)
    })
})

ipcMain.handle('backup:rollback', async (event, backupMeta) => {
    return backupManager.rollback(backupMeta, (p) => {
        if (!event.sender.isDestroyed()) event.sender.send('backup:progress', p)
    })
})

ipcMain.handle('backup:delete', (_, backupPath) => backupManager.deleteBackup(backupPath))

// ── History Management handlers ───────────────────────────
ipcMain.handle('history:get', async (event, drive) => {
    return await historyManager.getSessionHistory(drive)
})

ipcMain.handle('history:undo', async (event, { sessionId, drive }) => {
    return await historyManager.undoSession(sessionId, drive, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('history:undoProgress', progress)
    })
})

// ──────────────────────────────────────────────
// IPC Handlers — Logging & Report
// ──────────────────────────────────────────────

ipcMain.handle('log:getAll', () => auditLogger.getAll())

ipcMain.handle('log:export', async (_, format) => {
    const formatMap = {
        json: [{ name: 'JSON', extensions: ['json'] }],
        csv: [{ name: 'CSV', extensions: ['csv'] }],
        html: [{ name: 'HTML Report', extensions: ['html'] }],
    }
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Report — WhereDidIPutThat',
        defaultPath: `wheredidiputhat_report_${Date.now()}.${format}`,
        filters: formatMap[format] || [{ name: format.toUpperCase(), extensions: [format] }],
    })
    if (canceled || !filePath) return null
    return auditLogger.exportReport(filePath, format)
})

ipcMain.handle('log:clear', () => auditLogger.clearLog())

ipcMain.handle('phase:rollback', async (event, movedFiles) => {
    return await core.phaseEngine.startRollback(movedFiles, (p) => {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('phase:rollbackProgress', p)
    })
})

// ──────────────────────────────────────────────
// IPC Handlers — Performance
// ──────────────────────────────────────────────

ipcMain.handle('perf:getStats', () => performanceController.getStats())

// ──────────────────────────────────────────────
// IPC Handlers — Settings
// ──────────────────────────────────────────────

ipcMain.handle('settings:getAll', () => settingsManager.getAll())
ipcMain.handle('settings:update', (_, newSettings) => settingsManager.update(newSettings))
ipcMain.handle('settings:get', (_, key) => settingsManager.get(key))

// ──────────────────────────────────────────────
// IPC Handlers — Disk Space
// ──────────────────────────────────────────────

ipcMain.handle('disk:checkSpace', (_, targetPath, requiredBytes) =>
    diskUtils.checkDiskSpace(targetPath, requiredBytes)
)

// ──────────────────────────────────────────────
// IPC Handlers — Duplicate Detection
// ──────────────────────────────────────────────

const duplicateDetector = require('./core/duplicateDetector')
ipcMain.handle('scan:duplicates', async (event, manifest) => {
    return duplicateDetector.findDuplicates(manifest, (checked, total) => {
        if (!event.sender.isDestroyed()) {
            event.sender.send('scan:duplicateProgress', { checked, total })
        }
    })
})

// ──────────────────────────────────────────────
// IPC Handlers — Updates
// ──────────────────────────────────────────────

ipcMain.handle('updates:check', () => {
    if (isDev) {
        return { status: 'dev', message: 'Update checks disabled in development mode.' }
    }
    // autoUpdater is initialized inside app.whenReady() — require it lazily here
    const { autoUpdater: au } = require('electron-updater')
    return au.checkForUpdatesAndNotify()
})

