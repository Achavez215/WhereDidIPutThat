/**
 * main.js — WhereDidIPutThat
 * Electron main process entry point.
 */

'use strict'

// Standard Electron require.
// Fixed: In some environments, ELECTRON_RUN_AS_NODE can hijack the resolution.
// The smoke test now ensures this is cleared.
const electron = require('electron')
const { app, BrowserWindow, ipcMain, dialog, session, nativeTheme } = electron

if (!app) {
    console.error('CRITICAL: Electron app object is undefined.')
    if (typeof Deno !== "undefined") { Deno.exit(1); } else if (typeof process !== "undefined") { process.exit(1); }
}

const path = require('path')
const isDev = (process.env.ELECTRON_IS_DEV === '1') || (app && !app.isPackaged)

let mainWindow = null
const core = {}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#0b0d12',
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    })

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173')
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
    // Lazy load core modules after app is ready to ensure pathManager (app.getPath) works
    try {
        core.driveScanner = require('./core/driveScanner')
        core.safetyGuard = require('./core/safetyGuard')
        core.fileScanner = require('./core/fileScanner')
        core.phaseEngine = require('./core/phaseEngine')
        core.backupManager = require('./core/backupManager')
        core.checkpointLogger = require('./core/checkpointLogger')
        core.auditLogger = require('./core/auditLogger')
        core.performanceController = require('./core/performanceController')
        core.settingsManager = require('./core/settingsManager')
        core.diskUtils = require('./core/diskUtils')
        core.historyManager = require('./core/historyManager')
        core.dbManager = require('./core/dbManager')
        core.duplicateDetector = require('./core/duplicateDetector')
    } catch (err) {
        console.error('Failed to load core modules:', err)
        app.quit()
        return
    }

    createWindow()
    registerIpcHandlers()
})

function registerIpcHandlers() {
    ipcMain.handle('theme:get', () => nativeTheme.shouldUseDarkColors)

    ipcMain.handle('drives:list', () => core.driveScanner.listDrives())
    ipcMain.handle('folder:listTopLevel', (_, drivePath) => core.driveScanner.listTopLevelFolders(drivePath))
    ipcMain.handle('folder:browse', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Select Destination Folder',
        })
        return result.canceled ? null : result.filePaths[0]
    })

    ipcMain.handle('safety:isProtected', (_, p) => core.safetyGuard.isProtected(p))
    ipcMain.handle('safety:validateTarget', (_, src, dst) => core.safetyGuard.validateTarget(src, dst))

    ipcMain.handle('phase:startPhase', async (event, phaseNumber, context) => {
        return core.phaseEngine.startPhase(phaseNumber, context, (progress) => {
            if (!event.sender.isDestroyed()) event.sender.send('phase:progress', progress)
        })
    })

    ipcMain.handle('db:getFiles', (_, category, page, limit) => {
        const offset = (page - 1) * (limit || 50)
        return core.dbManager.getFiles(category, limit || 50, offset)
    })

    ipcMain.handle('db:getStats', () => core.dbManager.getStats())
    ipcMain.handle('phase:pause', () => core.performanceController.pause())
    ipcMain.handle('phase:resume', () => core.performanceController.resume())
    ipcMain.handle('phase:cancel', (_, ctx) => core.phaseEngine.cancel(ctx))
    ipcMain.handle('phase:startCleanup', (_, ctx) => core.phaseEngine.startCleanup(ctx))
    ipcMain.handle('phase:checkCheckpoint', () => core.checkpointLogger.readCheckpoint())
    ipcMain.handle('phase:clearCheckpoint', () => core.checkpointLogger.clearCheckpoint())
    ipcMain.handle('phase:hydrateCheckpoint', () => core.checkpointLogger.readCheckpoint())

    ipcMain.handle('backup:create', async (event, files, destDrive) => {
        return core.backupManager.createBackup(files, destDrive, (p) => {
            if (!event.sender.isDestroyed()) event.sender.send('backup:progress', p)
        })
    })

    ipcMain.handle('backup:rollback', async (event, backupMeta) => {
        return core.backupManager.rollback(backupMeta, (p) => {
            if (!event.sender.isDestroyed()) event.sender.send('backup:progress', p)
        })
    })

    ipcMain.handle('backup:delete', (_, backupPath) => core.backupManager.deleteBackup(backupPath))

    ipcMain.handle('history:get', async (event, drive) => {
        return await core.historyManager.getSessionHistory(drive)
    })

    ipcMain.handle('history:undo', async (event, { sessionId, drive }) => {
        return await core.historyManager.undoSession(sessionId, drive, (progress) => {
            if (!event.sender.isDestroyed()) event.sender.send('history:undoProgress', progress)
        })
    })

    ipcMain.handle('log:getAll', () => core.auditLogger.getAll())
    ipcMain.handle('log:export', async (_, format) => {
        const formatMap = {
            json: [{ name: 'JSON', extensions: ['json'] }],
            csv: [{ name: 'CSV', extensions: ['csv'] }],
            html: [{ name: 'HTML Report', extensions: ['html'] }],
        }
        const { filePath, canceled } = await dialog.showOpenDialog(mainWindow, {
            title: 'Export Report — WhereDidIPutThat',
            defaultPath: `wheredidiputhat_report_${Date.now()}.${format}`,
            filters: formatMap[format] || [{ name: format.toUpperCase(), extensions: [format] }],
        })
        if (canceled || !filePath) return null
        return core.auditLogger.exportReport(filePath, format)
    })
    ipcMain.handle('log:clear', () => core.auditLogger.clearLog())

    ipcMain.handle('phase:rollback', async (event, movedFiles) => {
        return await core.phaseEngine.startRollback(movedFiles, (p) => {
            if (!mainWindow.isDestroyed()) mainWindow.webContents.send('phase:rollbackProgress', p)
        })
    })

    ipcMain.handle('perf:getStats', () => core.performanceController.getStats())

    ipcMain.handle('settings:getAll', () => core.settingsManager.getAll())
    ipcMain.handle('settings:update', (_, newSettings) => core.settingsManager.update(newSettings))
    ipcMain.handle('settings:get', (_, key) => core.settingsManager.get(key))

    ipcMain.handle('disk:checkSpace', (_, targetPath, requiredBytes) =>
        core.diskUtils.checkDiskSpace(targetPath, requiredBytes)
    )

    ipcMain.handle('scan:duplicates', async (event, manifest) => {
        return core.duplicateDetector.findDuplicates(manifest, (checked, total) => {
            if (!event.sender.isDestroyed()) {
                event.sender.send('scan:duplicateProgress', { checked, total })
            }
        })
    })

    ipcMain.handle('updates:check', () => {
        if (isDev) {
            return { status: 'dev', message: 'Update checks disabled in development mode.' }
        }
        const { autoUpdater: au } = require('electron-updater')
        return au.checkForUpdatesAndNotify()
    })
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
