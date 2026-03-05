import React, { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import DriveSelector from './components/DriveSelector'
import FolderSelector from './components/FolderSelector'
import DestinationMapper from './components/DestinationMapper'
import PhasePanel from './components/PhasePanel'
import ReportScreen from './components/ReportScreen'
import PermissionGate from './components/PermissionGate'
import SettingsScreen from './components/SettingsScreen'
import HelpScreen from './components/HelpScreen'
import UpdateBanner from './components/UpdateBanner'

const STEPS = [
    { key: 'drive', label: 'Drive', icon: '💽' },
    { key: 'folders', label: 'Folders', icon: '📂' },
    { key: 'mapping', label: 'Mapping', icon: '🗺️' },
    { key: 'phases', label: 'Execution', icon: '⚡' },
    { key: 'report', label: 'Report', icon: '📋' },
]

const STEP_INDICES = { drive: 0, folders: 1, mapping: 2, phases: 3, report: 4 }

export default function App() {
    const { view, setView, step, setStep, checkpoint, setCheckpoint, dismissCheckpoint } = useAppStore()

    // On launch: check for an unfinished checkpoint and settings
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
    }, [])

    const currentStepIndex = STEP_INDICES[step] ?? 0
    const isStepDone = (key) => STEP_INDICES[key] < currentStepIndex
    const isStepActive = (key) => key === step

    return (
        <div className="app">
            <UpdateBanner />
            {/* ── Title bar ── */}
            <header className="app-header">
                <img src="/logo.png" className="logo-img" alt="logo" style={{ height: '32px', width: '32px', borderRadius: '6px' }} />
                <h1 style={{ marginLeft: '12px' }}>WhereDidIPutThat</h1>
                <span className="badge">SAFE MODE</span>
                <div className="spacer" />
                <div className="local-badge">LOCAL ONLY — NO CLOUD</div>
            </header>

            <div className="app-body">
                {/* ── Sidebar ── */}
                <aside className="sidebar">
                    {STEPS.map((s, i) => (
                        <div
                            key={s.key}
                            className={`sidebar-step ${isStepActive(s.key) ? 'active' : ''} ${isStepDone(s.key) ? 'complete' : ''}`}
                        >
                            <div className="step-num">
                                {isStepDone(s.key) ? '✓' : i + 1}
                            </div>
                            <div className="step-label">{s.icon} {s.label}</div>
                        </div>
                    ))}

                    <div style={{ flex: 1 }} />

                    {/* Nav Footer */}
                    <div style={{ padding: 'var(--sp-4) 0', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
                        <button
                            className={`btn w-full flex mb-2 ${view === 'organizer' ? 'btn-active-lite' : 'btn-ghost'}`}
                            style={{ justifyContent: 'flex-start', border: view === 'organizer' ? '1px solid var(--accent-teal)' : '1px solid transparent', background: view === 'organizer' ? 'rgba(56,189,248,0.05)' : 'transparent' }}
                            onClick={() => setView('organizer')}
                        >
                            <span>🧭</span> Organizer
                        </button>
                        <button
                            className={`btn w-full flex mb-2 ${view === 'settings' ? 'btn-active-lite' : 'btn-ghost'}`}
                            style={{ justifyContent: 'flex-start', border: view === 'settings' ? '1px solid var(--accent-teal)' : '1px solid transparent', background: view === 'settings' ? 'rgba(56,189,248,0.05)' : 'transparent' }}
                            onClick={() => setView('settings')}
                        >
                            <span>⚙️</span> Settings
                        </button>
                        <button
                            className={`btn w-full flex mb-4 ${view === 'help' ? 'btn-active-lite' : 'btn-ghost'}`}
                            style={{ justifyContent: 'flex-start', border: view === 'help' ? '1px solid var(--accent-teal)' : '1px solid transparent', background: view === 'help' ? 'rgba(56,189,248,0.05)' : 'transparent' }}
                            onClick={() => setView('help')}
                        >
                            <span>📖</span> Help & Q&A
                        </button>

                        {/* Protection status */}
                        <div style={{
                            padding: '12px',
                            borderRadius: '8px',
                            background: 'rgba(52,211,153,0.05)',
                            border: '1px solid rgba(52,211,153,0.15)',
                            fontSize: '10px',
                            color: 'var(--text-muted)',
                            lineHeight: '1.6',
                        }}>
                            <div style={{ color: 'var(--accent-green)', fontWeight: 600, marginBottom: '4px' }}>
                                🛡️ Safety Mode Active
                            </div>
                        </div>
                    </div>
                </aside>

                {/* ── Main content ── */}
                <main className="main-content">
                    {/* Checkpoint resume banner */}
                    {checkpoint && (
                        <div className="checkpoint-banner">
                            <span className="text-amber">⚡</span>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Unfinished Run Detected</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Last checkpoint: Phase {checkpoint.phase}
                                    {checkpoint.updatedAt ? ` — ${new Date(checkpoint.updatedAt).toLocaleString()}` : ''}
                                </div>
                            </div>
                            <button
                                className="btn btn-amber btn-sm"
                                onClick={() => { setStep('phases'); dismissCheckpoint() }}
                                id="btn-resume-checkpoint"
                            >
                                Resume
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={async () => {
                                    await window.api.clearCheckpoint()
                                    dismissCheckpoint()
                                }}
                                id="btn-dismiss-checkpoint"
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
                            {step === 'report' && <ReportScreen />}
                        </>
                    )}

                    {view === 'settings' && <SettingsScreen />}
                    {view === 'help' && <HelpScreen />}
                </main>
            </div>
        </div>
    )
}
