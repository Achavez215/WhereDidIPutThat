import { create } from 'zustand'

const PHASES = [
    { num: 1, label: 'Analysis', desc: 'Scan & index files' },
    { num: 2, label: 'Preview', desc: 'Review classification' },
    { num: 3, label: 'Backup', desc: 'Create safety backup' },
    { num: 4, label: 'Execute', desc: 'Move files' },
    { num: 5, label: 'Validate', desc: 'Integrity check' },
    { num: 6, label: 'Report', desc: 'Final summary' },
]

export const useAppStore = create((set, get) => ({
    // ── Drive & Folder Selection ──────────────────────────────
    drives: [],
    selectedDrive: null,
    topLevelFolders: [],
    selectedFolders: [],

    setDrives: (drives) => set({ drives }),
    selectDrive: (drive) => set({ selectedDrive: drive, selectedFolders: [], topLevelFolders: [], manifest: null }),
    setTopLevelFolders: (folders) => set({ topLevelFolders: folders }),
    toggleFolder: (folder) => {
        const { selectedFolders } = get()
        const exists = selectedFolders.find(f => f.fullPath === folder.fullPath)
        set({ selectedFolders: exists ? selectedFolders.filter(f => f.fullPath !== folder.fullPath) : [...selectedFolders, folder] })
    },
    selectAllFolders: () => set(s => ({ selectedFolders: s.topLevelFolders })),
    clearFolders: () => set({ selectedFolders: [] }),

    // ── Exclusions (Phase 3) ──────────────────────────────────
    excludedPaths: new Set(),
    togglePathExclusion: (path) => set(s => {
        const next = new Set(s.excludedPaths)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return { excludedPaths: next }
    }),

    // ── File Manifest & Stats ─────────────────────────────────
    manifest: null,
    stats: null,
    scanTree: null,
    actionPlan: null,
    setManifest: (manifest, stats, scanTree) => set({ manifest, stats, scanTree }),
    setActionPlan: (actionPlan) => set({ actionPlan }),
    updateRecommendation: (fileId, newDst) => set(s => ({
        actionPlan: {
            ...s.actionPlan,
            recommendations: s.actionPlan.recommendations.map(r =>
                r.fileId === fileId ? { ...r, suggestedDst: newDst } : r
            )
        }
    })),
    rejectRecommendation: (fileId) => set(s => ({
        actionPlan: {
            ...s.actionPlan,
            recommendations: s.actionPlan.recommendations.filter(r => r.fileId !== fileId)
        }
    })),

    // ── Destination Mapping ───────────────────────────────────
    destinationMap: {
        images: '', videos: '', audio: '',
        pdfs: '', word_docs: '', documents: '',
        archives: '', applications: '', other: ''
    },
    setDestination: (category, path) => set(s => ({ destinationMap: { ...s.destinationMap, [category]: path } })),

    // ── Phase State ───────────────────────────────────────────
    phases: PHASES,
    currentPhase: 0, // 0 = pre-start
    phaseStatus: {}, // { [phaseNum]: 'idle' | 'running' | 'done' | 'error' | 'cancelled' }
    phaseProgress: {}, // { [phaseNum]: { percent, processed, failed, ... } }

    setCurrentPhase: (n) => set({ currentPhase: n }),
    setPhaseStatus: (n, status) => set(s => ({ phaseStatus: { ...s.phaseStatus, [n]: status } })),
    setPhaseProgress: (n, data) => set(s => ({ phaseProgress: { ...s.phaseProgress, [n]: { ...(s.phaseProgress[n] || {}), ...data } } })),

    // ── Backup ────────────────────────────────────────────────
    backupPath: null,
    backupManifestPath: null,
    skipBackup: false,
    backupDisposition: null, // 'delete' | 'keep' | null
    setBackup: (info) => set({ backupPath: info.backupPath, backupManifestPath: info.manifestPath }),
    setSkipBackup: (v) => set({ skipBackup: v }),
    setBackupDisposition: (d) => set({ backupDisposition: d }),

    // ── Pause / Cancel ────────────────────────────────────────
    isPaused: false,
    togglePause: async () => {
        const { isPaused } = get()
        if (isPaused) {
            await window.api.resumePhase()
            set({ isPaused: false })
        } else {
            await window.api.pausePhase()
            set({ isPaused: true })
        }
    },

    // ── Report ────────────────────────────────────────────────
    report: null,
    setReport: (r) => set({ report: r }),

    // ── Checkpoint ───────────────────────────────────────────
    checkpoint: null,
    setCheckpoint: (cp) => set({ checkpoint: cp }),
    dismissCheckpoint: () => set({ checkpoint: null }),

    // ── Navigation ────────────────────────────────────────────
    view: 'organizer', // 'organizer' | 'settings' | 'help'
    step: 'permission', // 'permission' | 'drive' | 'folders' | 'mapping' | 'phases' | 'report'
    setView: (v) => set({ view: v }),
    setStep: (s) => set({ step: s }),
}))

export { PHASES }
