import React, { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import DriveSelector from './components/DriveSelector'
import FolderSelector from './components/FolderSelector'
import DestinationMapper from './components/DestinationMapper'
import PhasePanel from './components/PhasePanel'
import ReportScreen from './components/ReportScreen'
import PermissionGate from './components/PermissionGate'
import SettingsScreen from './components/SettingsScreen'
import RollbackView from './components/RollbackView'
import HistoryView from './components/HistoryView'
import ReportView from './components/ReportView'
import HelpScreen from './components/HelpScreen'
import UpdateBanner from './components/UpdateBanner'

const STEPS = [
    { key: 'drive', label: 'Drive', icon: '💽' },
    { key: 'folders', label: 'Folders', icon: '📂' },
    { key: 'mapping', label: 'Mapping', icon: '🗺️' },
    { key: 'phases', label: 'Execution', icon: '⚡' },
    { key: 'report', label: 'Report', icon: '📋' },
    { key: 'history', label: 'History', icon: '⏪' },
]

const STEP_INDICES = { drive: 0, folders: 1, mapping: 2, phases: 3, report: 4 }

export default function App() {
    const { view, setView, step, setStep, checkpoint, setCheckpoint, dismissCheckpoint } = useAppStore()

    // On launch: check for an unfinished checkpoint, load settings, and sync OS theme
    useEffect(() => {
        window.api.checkCheckpoint().then(cp => {
            if (cp && cp.phase && cp.phase < 6) {
                setCheckpoint(cp)
            }
        }).catch(() => { })

        window.api.getSettings().then(settings => {
            if (settings && !settings.firstRun && step === 'permission') {
                setStep('drive')
            }
        })

        // Sync OS dark/light mode on first launch
        if (window.api.getSystemTheme) {
            window.api.getSystemTheme().then(isDark => {
                document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
            }).catch(() => { })
        }

        // Listen for OS theme changes in real time
        if (window.api.onThemeChanged) {
            window.api.onThemeChanged((isDark) => {
                document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
            })
        }
    }, [])

    const currentStepIndex = STEP_INDICES[step] ?? 0
    const isStepDone = (key) => STEP_INDICES[key] < currentStepIndex
    const isStepActive = (key) => key === step

    return (
        <div className="app">
            <UpdateBanner />
            {/* ── Title bar ── */}
            <header className="app-header">
                <img src="./logo.png" className="logo-img" alt="WhereDidIPutThat logo" />
                <h1>WhereDidIPutThat</h1>
                <span className="badge" aria-label="Safe Mode is active">SAFE MODE</span>
                <div className="spacer" />
                <div className="local-badge" aria-label="This app is local only — no cloud sync">
                    LOCAL ONLY
                </div>
            </header>

            <div className="app-body">
                {/* ── Sidebar ── */}
                <nav className="sidebar" aria-label="Organizer workflow steps">
                    {STEPS.map((s, i) => (
                        <div
                            key={s.key}
                            className={`sidebar-step ${isStepActive(s.key) ? 'active' : ''} ${isStepDone(s.key) ? 'complete' : ''}`}
                            aria-current={isStepActive(s.key) ? 'step' : undefined}
                            aria-label={`Step ${i + 1}: ${s.label}${isStepDone(s.key) ? ' — completed' : isStepActive(s.key) ? ' — current' : ''}`}
                            role="listitem"
                        >
                            <div className="step-num" aria-hidden="true">
                                {isStepDone(s.key) ? '✓' : i + 1}
                            </div>
                            <div className="step-label">
                                <span aria-hidden="true">{s.icon}</span>{' '}{s.label}
                            </div>
                        </div>
                    ))}

                    <div style={{ flex: 1 }} />

                    {/* Nav Footer */}
                    <div
                        style={{ padding: 'var(--sp-4) 0', borderTop: '1px solid var(--border)', marginTop: 'auto' }}
                        role="group"
                        aria-label="App navigation"
                    >
                        <button
                            className={`btn w-full flex mb-2 ${view === 'organizer' ? 'btn-active-lite' : 'btn-ghost'}`}
                            style={{ justifyContent: 'flex-start', border: view === 'organizer' ? '1px solid var(--accent-teal)' : '1px solid transparent', background: view === 'organizer' ? 'rgba(56,189,248,0.05)' : 'transparent' }}
                            onClick={() => setView('organizer')}
                            aria-pressed={view === 'organizer'}
                            aria-label="Go to Organizer"
                        >
                            <span aria-hidden="true">🧭</span> Organizer
                        </button>
                        <button
                            className={`btn w-full flex mb-2 ${view === 'settings' ? 'btn-active-lite' : 'btn-ghost'}`}
                            style={{ justifyContent: 'flex-start', border: view === 'settings' ? '1px solid var(--accent-teal)' : '1px solid transparent', background: view === 'settings' ? 'rgba(56,189,248,0.05)' : 'transparent' }}
                            onClick={() => setView('settings')}
                            aria-pressed={view === 'settings'}
                            aria-label="Go to Settings"
                        >
                            <span aria-hidden="true">⚙️</span> Settings
                        </button>
                        <button
                            className={`btn w-full flex mb-4 ${view === 'help' ? 'btn-active-lite' : 'btn-ghost'}`}
                            style={{ justifyContent: 'flex-start', border: view === 'help' ? '1px solid var(--accent-teal)' : '1px solid transparent', background: view === 'help' ? 'rgba(56,189,248,0.05)' : 'transparent' }}
                            onClick={() => setView('help')}
                            aria-pressed={view === 'help'}
                            aria-label="Go to Help and Q&A"
                        >
                            <span aria-hidden="true">📖</span> Help &amp; Q&amp;A
                        </button>

                        {/* Protection status */}
                        <div
                            role="status"
                            aria-live="polite"
                            style={{
                                padding: '12px',
                                borderRadius: '8px',
                                background: 'rgba(52,211,153,0.05)',
                                border: '1px solid rgba(52,211,153,0.15)',
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                lineHeight: '1.6',
                            }}
                        >
                            <div style={{ color: 'var(--accent-green)', fontWeight: 600, marginBottom: '4px' }}>
                                <span aria-hidden="true">🛡️</span> Safety Mode Active
                            </div>
                        </div>
                    </div>
                </nav>

                {/* ── Main content ── */}
                <main className="main-content" id="main-content" aria-label="Main content area">
                    {/* Checkpoint resume banner */}
                    {checkpoint && (
                        <div className="checkpoint-banner" role="alert" aria-live="assertive">
                            <span aria-hidden="true">⚡</span>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Unfinished Run Detected</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Last checkpoint: Phase {checkpoint.phase}
                                    {checkpoint.updatedAt ? ` — ${new Date(checkpoint.updatedAt).toLocaleString()}` : ''}
                                </div>
                            </div>
                            <button
                                className="btn btn-amber btn-sm"
                                onClick={async () => {
                                    // Wait for full hydration before navigating
                                    const fullState = await window.api.hydrateCheckpoint()
                                    if (!fullState) return

                                    // Pass the recovered data into Zustand
                                    if (fullState.tree) {
                                        useAppStore.getState().setManifest(fullState.stats, fullState.tree)
                                    }
                                    if (fullState.actionPlan) {
                                        useAppStore.getState().setActionPlan(fullState.actionPlan)
                                    }

                                    // Set the phase visually to where it left off
                                    if (fullState.phase) {
                                        useAppStore.getState().setCurrentPhase(fullState.phase)
                                        useAppStore.getState().setPhaseStatus(fullState.phase, 'running')
                                        // Allow backend to know we are resuming (for cleanuppass)
                                        useAppStore.getState().setResuming(true)
                                    }

                                    setStep('phases')
                                    dismissCheckpoint()
                                }}
                                id="btn-resume-checkpoint"
                                aria-label={`Resume from Phase ${checkpoint.phase}`}
                            >
                                ⚡ Resume Execution
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={async () => {
                                    await window.api.clearCheckpoint()
                                    dismissCheckpoint()
                                }}
                                id="btn-dismiss-checkpoint"
                                aria-label="Dismiss checkpoint and start a fresh session"
                            >
                                Start Fresh
                            </button>
                        </div>
                    )}

                    {view === 'organizer' && (
                        <>
                            {step === 'permission' && <PermissionGate />}
                            {step === 'drive' && <DriveSelector />}
                            {step === 'folders' && <FolderSelector />}
                            {step === 'mapping' && <DestinationMapper />}
                            {step === 'phases' && <PhasePanel />}
                            {step === 'report' && <ReportView />}
                            {step === 'rollback' && <RollbackView />}
                            {step === 'history' && <HistoryView />}
                        </>
                    )}

                    {view === 'settings' && <SettingsScreen />}
                    {view === 'help' && <HelpScreen />}
                </main>
            </div>
        </div>
    )
}
