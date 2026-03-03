import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// ── Electron API guard ──────────────────────────────────────────────────────
// When running outside Electron (e.g. plain browser / Vite dev server without
// electron.exe), window.api is not injected by the preload script.
// Install safe stubs so no component crashes on import.
if (!window.api) {
    const noop = () => Promise.resolve(null)
    const noopArr = () => Promise.resolve([])
    window.api = {
        // Drive & Folder — return empty lists in browser
        listDrives: noopArr,
        listTopLevelFolders: noopArr,
        browseFolder: noop,

        // Safety
        isProtected: () => Promise.resolve(false),
        validateTarget: () => Promise.resolve({ ok: true }),

        // Phase engine
        startPhase: noop,
        pausePhase: noop,
        resumePhase: noop,
        cancelPhase: noop,
        checkCheckpoint: () => Promise.resolve(null),
        clearCheckpoint: noop,

        // Backup
        createBackup: () => Promise.resolve({ ok: false, error: 'Not in Electron' }),
        rollbackBackup: noop,
        deleteBackup: noop,

        // Logging
        getLogs: noopArr,
        exportReport: noop,

        // Performance
        getPerfStats: () => Promise.resolve({ memUsedMB: 0, memTotalMB: 0, memPercent: 0, paused: false }),

        // Event listeners
        onPhaseProgress: () => { },
        onBackupProgress: () => { },
        removePhaseListeners: () => { },
        removeBackupListeners: () => { },
    }

    // Show a non-intrusive dev banner so we know we're not in Electron
    if (import.meta.env.DEV) {
        console.warn(
            '[WhereDidIPutThat] window.api not found — running in browser-only mode (stubs active).\n' +
            'Launch via: .\\node_modules\\electron\\dist\\electron.exe . (with Vite running on port 5173)'
        )
    }
}
// ───────────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
