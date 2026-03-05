const { contextBridge, ipcRenderer } = require('electron')

// Expose a safe, whitelisted API surface to the renderer (React app).
// Nothing else from Node/Electron is accessible.
contextBridge.exposeInMainWorld('api', {
    // Drives & Folders
    listDrives: () => ipcRenderer.invoke('drives:list'),
    listTopLevelFolders: (drivePath) => ipcRenderer.invoke('folder:listTopLevel', drivePath),
    browseFolder: () => ipcRenderer.invoke('folder:browse'),

    // Safety checks
    isProtected: (p) => ipcRenderer.invoke('safety:isProtected', p),
    validateTarget: (src, dst) => ipcRenderer.invoke('safety:validateTarget', src, dst),

    // Phase engine
    startPhase: (phaseNumber, context) => ipcRenderer.invoke('phase:startPhase', phaseNumber, context),
    pausePhase: () => ipcRenderer.invoke('phase:pause'),
    resumePhase: () => ipcRenderer.invoke('phase:resume'),
    cancelPhase: (context) => ipcRenderer.invoke('phase:cancel', context),
    checkCheckpoint: () => ipcRenderer.invoke('phase:checkCheckpoint'),
    clearCheckpoint: () => ipcRenderer.invoke('phase:clearCheckpoint'),

    // Backup
    createBackup: (files, destDrive) => ipcRenderer.invoke('backup:create', files, destDrive),
    rollbackBackup: (backupMeta) => ipcRenderer.invoke('backup:rollback', backupMeta),
    deleteBackup: (backupPath) => ipcRenderer.invoke('backup:delete', backupPath),

    // Logging & Report
    getLogs: () => ipcRenderer.invoke('log:getAll'),
    exportReport: (format) => ipcRenderer.invoke('log:export', format),
    clearLog: () => ipcRenderer.invoke('log:clear'),

    // Performance stats
    getPerfStats: () => ipcRenderer.invoke('perf:getStats'),

    // Settings
    getSettings: () => ipcRenderer.invoke('settings:getAll'),
    updateSettings: (newSettings) => ipcRenderer.invoke('settings:update', newSettings),
    getSetting: (key) => ipcRenderer.invoke('settings:get', key),

    // Updates
    checkForUpdates: () => ipcRenderer.invoke('updates:check'),
    onUpdateAvailable: (cb) => ipcRenderer.on('update:available', () => cb()),
    onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', () => cb()),

    // OS Theme
    getSystemTheme: () => ipcRenderer.invoke('theme:get'),
    onThemeChanged: (cb) => ipcRenderer.on('theme:changed', (_, isDark) => cb(isDark)),

    // Disk space
    checkDiskSpace: (targetPath, requiredBytes) => ipcRenderer.invoke('disk:checkSpace', targetPath, requiredBytes),

    // Event listeners (one-way from main → renderer)
    onPhaseProgress: (cb) => ipcRenderer.on('phase:progress', (_, data) => cb(data)),
    onBackupProgress: (cb) => ipcRenderer.on('backup:progress', (_, data) => cb(data)),

    // Cleanup listeners to avoid memory leaks
    removePhaseListeners: () => ipcRenderer.removeAllListeners('phase:progress'),
    removeBackupListeners: () => ipcRenderer.removeAllListeners('backup:progress'),
})
