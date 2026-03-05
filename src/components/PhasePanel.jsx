import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'

const PHASE_META = [
    { num: 1, title: 'Analysis & Indexing', desc: 'Recursively scan selected folders and build file index.', icon: '🔍' },
    { num: 2, title: 'Classification Preview', desc: 'Review file breakdown by category before proceeding.', icon: '📊' },
    { num: 3, title: 'Backup Creation', desc: 'Create a safety backup snapshot of all files to be moved.', icon: '🛡️' },
    { num: 4, title: 'File Execution', desc: 'Copy → Verify → Delete each file to its destination.', icon: '⚡' },
    { num: 5, title: 'Validation & Integrity Check', desc: 'Spot-check a sample of moved files to confirm success.', icon: '✅' },
    { num: 6, title: 'Final Report', desc: 'Generate a complete audit log and summary of all actions taken.', icon: '📋' },
]

function ProgressBar({ percent, label }) {
    return (
        <div
            className="progress-bar-wrap mt-4"
            role="progressbar"
            aria-valuenow={Math.min(100, percent || 0)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label || 'Phase progress'}
        >
            <div className="progress-bar-fill" style={{ width: `${Math.min(100, percent || 0)}%` }} />
        </div>
    )
}

function PerfRow({ stats }) {
    if (!stats) return null
    return (
        <div className="phase-perf">
            <div className="perf-item"><span>Memory</span><span>{stats.memUsedMB}MB / {stats.memTotalMB}MB ({stats.memPercent}%)</span></div>
            <div className="perf-item"><span>ETA</span><span>{stats.etaSeconds != null ? `~${stats.etaSeconds}s` : '—'}</span></div>
            <div className="perf-item"><span>Status</span><span>{stats.paused ? '⏸ Paused' : '▶ Running'}</span></div>
        </div>
    )
}

export default function PhasePanel() {
    const {
        selectedFolders, manifest, stats, destinationMap, backupPath, backupManifestPath,
        currentPhase, setCurrentPhase, phaseStatus, setPhaseStatus,
        phaseProgress, setPhaseProgress, setManifest, setReport,
        isPaused, togglePause, setStep, setBackup,
    } = useAppStore()

    const [perfStats, setPerfStats] = useState(null)
    const [showBackupPrompt, setShowBackupPrompt] = useState(false)
    const [backupSkipped, setBackupSkipped] = useState(false)
    const perfPoll = useRef(null)

    // Subscribe to IPC progress events
    useEffect(() => {
        window.api.onPhaseProgress((data) => {
            const { phase } = data
            setPhaseProgress(phase, data)
            if (data.status === 'done' || data.status === 'cancelled') {
                setPhaseStatus(phase, data.status === 'cancelled' ? 'cancelled' : 'done')
            }
            if (data.report) setReport(data.report)
            if (data.manifest) setManifest(data.manifest, data.stats)
        })
        return () => window.api.removePhaseListeners()
    }, [])

    // Poll perf stats while active
    useEffect(() => {
        if (currentPhase > 0 && phaseStatus[currentPhase] === 'running') {
            perfPoll.current = setInterval(async () => {
                const s = await window.api.getPerfStats()
                setPerfStats(s)
            }, 1000)
        } else {
            clearInterval(perfPoll.current)
        }
        return () => clearInterval(perfPoll.current)
    }, [currentPhase, phaseStatus])

    const buildContext = (phaseNum) => ({
        folderPaths: selectedFolders.map(f => f.fullPath),
        manifest,
        stats,
        destinationMap: Object.fromEntries(
            Object.entries(destinationMap).map(([k, v]) => [k, v || null])
        ),
        backupPath: backupPath || null,
        backupManifestPath: backupManifestPath || null,
    })

    const startPhase = async (phaseNum) => {
        // Phase 3 special: trigger backup UI first
        if (phaseNum === 3 && !backupPath && !backupSkipped) {
            setShowBackupPrompt(true)
            return
        }

        setCurrentPhase(phaseNum)
        setPhaseStatus(phaseNum, 'running')
        setPerfStats(null)

        const context = buildContext(phaseNum)
        try {
            const result = await window.api.startPhase(phaseNum, context)
            if (phaseNum === 1 && result.manifest) {
                setManifest(result.manifest, result.stats)
            }
            if (phaseNum === 6 && result.report) {
                setReport(result.report)
            }
            setPhaseStatus(phaseNum, result.ok ? 'done' : 'error')
        } catch (err) {
            setPhaseStatus(phaseNum, 'error')
        }
    }

    const handleCancel = async () => {
        await window.api.cancelPhase(buildContext(currentPhase))
        setPhaseStatus(currentPhase, 'cancelled')
    }

    const isPhaseUnlocked = (num) => {
        if (num === 1) return true
        return phaseStatus[num - 1] === 'done'
    }

    const getCardClass = (num) => {
        const s = phaseStatus[num]
        if (s === 'done') return 'phase-card card done'
        if (s === 'running') return 'phase-card card active'
        if (!isPhaseUnlocked(num)) return 'phase-card card locked'
        return 'phase-card card'
    }

    const prog = (num) => phaseProgress[num] || {}

    return (
        <div>
            <div className="section-header">
                <div className="sub">Phased Execution</div>
                <h2>6-Phase Execution Engine</h2>
                <p>Each phase must be manually initiated. No automatic progression between phases.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {PHASE_META.map(({ num, title, desc, icon }) => {
                    const status = phaseStatus[num]
                    const p = prog(num)
                    const isActive = status === 'running'
                    const isDone = status === 'done'
                    const isError = status === 'error'

                    return (
                        <div
                            key={num}
                            className={getCardClass(num)}
                            aria-disabled={!isPhaseUnlocked(num)}
                            aria-label={`Phase ${num}: ${title} — ${isDone ? 'completed' : isActive ? 'running' : isError ? 'error' : !isPhaseUnlocked(num) ? 'locked' : 'ready'}`}
                        >
                            <div className="phase-header">
                                <div className="phase-number" aria-hidden="true">
                                    {isDone ? '✓' : num}
                                </div>
                                <div>
                                    <div className="phase-title"><span aria-hidden="true">{icon}</span> {title}</div>
                                    <div className="phase-desc">{desc}</div>
                                </div>
                                <div style={{ marginLeft: 'auto' }}>
                                    {isDone && <span className="info-tag text-green" aria-live="polite">Completed</span>}
                                    {isError && <span className="info-tag text-red" aria-live="polite">Error</span>}
                                    {status === 'cancelled' && <span className="info-tag text-amber" aria-live="polite">Cancelled</span>}
                                </div>
                            </div>

                            {/* Progress section — aria-live so screen readers announce updates */}
                            {isActive && (
                                <div role="status" aria-live="polite" aria-label={`Phase ${num} progress: ${p.percent || 0}% complete, ${p.processed || 0} of ${p.total || 0} files`}>
                                    <ProgressBar percent={p.percent || 0} label={`Phase ${num} progress`} />
                                    <div className="phase-stats mt-4">
                                        <div className="phase-stat">
                                            <div className="phase-stat-value">{(p.processed || 0).toLocaleString()}</div>
                                            <div className="phase-stat-label">Processed</div>
                                        </div>
                                        <div className="phase-stat">
                                            <div className="phase-stat-value">{(p.total || 0).toLocaleString()}</div>
                                            <div className="phase-stat-label">Total</div>
                                        </div>
                                        <div className="phase-stat">
                                            <div className="phase-stat-value text-red">{(p.failed || 0).toLocaleString()}</div>
                                            <div className="phase-stat-label">Failed</div>
                                        </div>
                                        <div className="phase-stat">
                                            <div className="phase-stat-value text-amber">{p.percent || 0}%</div>
                                            <div className="phase-stat-label">Complete</div>
                                        </div>
                                    </div>
                                    <PerfRow stats={perfStats} />
                                </div>
                            )}

                            {/* Done stats */}
                            {isDone && num === 1 && stats && (
                                <div className="flex gap-3 mt-4" style={{ flexWrap: 'wrap' }}>
                                    <span className="info-tag">📁 {stats.total.toLocaleString()} files indexed</span>
                                    {Object.entries(stats.byCategory).map(([k, v]) => v > 0 && (
                                        <span key={k} className="info-tag">
                                            {v.toLocaleString()} {k}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {isDone && num === 5 && p.passed != null && (
                                <div className="flex gap-3 mt-4">
                                    <span className="info-tag text-green">✅ {p.passed} checks passed</span>
                                    {p.missing > 0 && <span className="info-tag text-amber">⚠️ {p.missing} not found</span>}
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="phase-actions">
                                {!isDone && status !== 'running' && isPhaseUnlocked(num) && (
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => startPhase(num)}
                                        id={`btn-start-phase-${num}`}
                                        disabled={status === 'cancelled'}
                                        aria-label={status === 'error' ? `Retry Phase ${num}: ${title}` : `Start Phase ${num}: ${title}`}
                                    >
                                        <span aria-hidden="true">{status === 'error' ? '🔄' : '▶'}</span>
                                        {status === 'error' ? ' Retry Phase' : ` Start Phase ${num}`}
                                    </button>
                                )}
                                {isActive && (
                                    <>
                                        <button
                                            className="btn btn-ghost"
                                            onClick={togglePause}
                                            id={`btn-pause-phase-${num}`}
                                            aria-label={isPaused ? `Resume Phase ${num}` : `Pause Phase ${num}`}
                                            aria-pressed={isPaused}
                                        >
                                            <span aria-hidden="true">{isPaused ? '▶' : '⏸'}</span>
                                            {isPaused ? ' Resume' : ' Pause'}
                                        </button>
                                        <button
                                            className="btn btn-danger"
                                            onClick={handleCancel}
                                            id={`btn-cancel-phase-${num}`}
                                            aria-label={`Cancel Phase ${num} and trigger safe rollback`}
                                        >
                                            <span aria-hidden="true">✕</span> Cancel (Safe Rollback)
                                        </button>
                                    </>
                                )}
                                {isDone && num === 6 && (
                                    <button
                                        className="btn btn-green"
                                        onClick={() => setStep('report')}
                                        id="btn-view-report"
                                        aria-label="View full audit report"
                                    >
                                        <span aria-hidden="true">📋</span> View Full Report
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Backup Prompt Modal triggers from phase 3 */}
            {showBackupPrompt && (
                <BackupModal
                    onAccept={async (bPath) => {
                        setShowBackupPrompt(false)
                        setBackup({ backupPath: bPath, manifestPath: bPath ? `${bPath}\\backup_manifest.json` : null })
                        await startPhase(3)
                    }}
                    onSkip={() => {
                        setShowBackupPrompt(false)
                        setBackupSkipped(true)
                        startPhase(3)
                    }}
                    onClose={() => setShowBackupPrompt(false)}
                    selectedDrive={useAppStore.getState().selectedDrive}
                    manifest={manifest}
                />
            )}
        </div>
    )
}

function BackupModal({ onAccept, onSkip, onClose, selectedDrive, manifest }) {
    const [skipConfirm, setSkipConfirm] = useState(false)
    const [creating, setCreating] = useState(false)
    const [progress, setProgress] = useState(null)

    useEffect(() => {
        window.api.onBackupProgress(p => setProgress(p))
        return () => window.api.removeBackupListeners()
    }, [])

    const handleCreate = async () => {
        setCreating(true)
        const destDrive = selectedDrive?.mountPath || null
        const res = await window.api.createBackup(manifest || [], destDrive)
        setCreating(false)
        if (res.ok) onAccept(res.backupPath)
        else alert(`Backup failed: ${res.error}`)
    }

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="backup-modal-title">
            <div className="modal">
                <h3 id="backup-modal-title"><span aria-hidden="true">🛡️</span> Create Safety Backup?</h3>
                <p>
                    We strongly recommend creating a backup before moving files.
                    A backup snapshot will be saved to a timestamped folder on the same drive.
                    <br /><br />
                    <strong>{(manifest?.length || 0).toLocaleString()} files</strong> will be included.
                </p>
                {creating && progress && (
                    <div role="status" aria-live="polite" aria-label={`Backup progress: ${progress.percent || 0}% complete`}>
                        <ProgressBar percent={progress.percent || 0} label="Backup creation progress" />
                        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                            {progress.copied} / {progress.total} copied…
                        </p>
                    </div>
                )}
                {!skipConfirm ? (
                    <div className="modal-actions">
                        <button className="btn btn-ghost" onClick={() => setSkipConfirm(true)} disabled={creating} id="btn-skip-backup" aria-label="Skip backup (not recommended)">
                            Skip (not recommended)
                        </button>
                        <button className="btn btn-primary" onClick={handleCreate} disabled={creating} id="btn-create-backup" aria-label={creating ? 'Creating backup, please wait' : 'Yes, create a safety backup'}>
                            {creating ? 'Creating…' : <><span aria-hidden="true">✅</span> Yes, Create Backup</>}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="alert alert-warn mt-4" role="alert">
                            <span className="alert-icon" aria-hidden="true">⚠️</span>
                            <span>Are you sure? Without a backup, file moves cannot be automatically undone.</span>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setSkipConfirm(false)} id="btn-go-back-backup" aria-label="Go back to backup options"><span aria-hidden="true">←</span> Go Back</button>
                            <button className="btn btn-danger" onClick={onSkip} id="btn-confirm-skip-backup" aria-label="Confirm: proceed without creating a backup">
                                Proceed Without Backup
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
