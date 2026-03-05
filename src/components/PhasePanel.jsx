import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import ScanOverview from './ScanOverview'
import ActionPlanCard from './ActionPlanCard'
import { usePaginatedFiles } from '../hooks/usePaginatedFiles'

const PHASE_META = [
    { num: 1, title: 'Intelligent Scan', desc: 'Hierarchical scan and classification.', icon: '🔍' },
    { num: 2, title: 'Action Plan Generation', desc: 'AI-driven move recommendations and duplicate check.', icon: '📊' },
    { num: 3, title: 'User Review & Customization', desc: 'Confirm destinations and folder exclusions.', icon: '⚙️' },
    { num: 4, title: 'Execution', desc: 'Copy → Verify → Delete verified files.', icon: '⚡' },
    { num: 5, title: 'Validation', desc: 'Integrity spot-check of moved files.', icon: '✅' },
    { num: 6, title: 'Final Report', desc: 'Full audit log and summary.', icon: '📋' },
    { num: 7, title: 'Cleanup', desc: 'Scan for and remove empty folders.', icon: '🧹' },
]

const formatBytes = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

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
        isPaused, togglePause, setStep, setBackup, actionPlan, setActionPlan,
        excludedPaths,
    } = useAppStore()

    const [perfStats, setPerfStats] = useState(null)
    const [showBackupPrompt, setShowBackupPrompt] = useState(false)
    const [backupSkipped, setBackupSkipped] = useState(false)
    const perfPoll = useRef(null)

    // Using the specialized pagination hook
    const { files: previewFiles, loadMore, loading: loadingPreview, hasMore } = usePaginatedFiles('all')


    // Subscribe to IPC progress events
    useEffect(() => {
        window.api.onPhaseProgress((data) => {
            const { phase } = data
            setPhaseProgress(phase, data)
            if (data.status === 'done' || data.status === 'cancelled') {
                setPhaseStatus(phase, data.status === 'cancelled' ? 'cancelled' : 'done')
            }
            if (data.report) setReport(data.report)
            if (data.manifest) setManifest(data.manifest, data.stats, data.tree)
            if (data.actionPlan) setActionPlan(data.actionPlan)
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

    const buildContext = (phaseNum) => {
        const ctx = {
            folderPaths: selectedFolders.map(f => f.fullPath),
            manifest,
            stats,
            destinationMap: Object.fromEntries(
                Object.entries(destinationMap).map(([k, v]) => [k, v || null])
            ),
            backupPath: backupPath || null,
            backupManifestPath: backupManifestPath || null,
            selectedDrive: useAppStore.getState().selectedDrive,
        }

        if (phaseNum === 4) {
            // Pass excluded paths to backend; let backend handle DB retrieval
            ctx.excludedPaths = Array.from(excludedPaths)
        }

        if (phaseNum === 7) {
            ctx.folderPaths = selectedFolders.map(f => f.fullPath)
        }

        return ctx
    }

    const handleCleanup = async (folders) => {
        setPhaseStatus(7, 'running')
        try {
            const res = await window.api.startCleanup({ folders })
            if (res.ok) {
                setPhaseStatus(7, 'done')
                alert(`Successfully deleted ${res.deleted} empty folders.`)
            } else {
                setPhaseStatus(7, 'error')
            }
        } catch (err) {
            setPhaseStatus(7, 'error')
        }
    }

    const startPhase = async (phaseNum) => {
        // Phase 3 special: trigger backup UI first
        if (phaseNum === 3) {
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
                setManifest(result.manifest, result.stats, result.tree)
            }
            if (phaseNum === 2 && result.actionPlan) {
                setActionPlan(result.actionPlan)
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
        const confirmMsg = "Cancel current operation? This will halt further moves and trigger a safe rollback of items moved in this step."
        if (!window.confirm(confirmMsg)) return

        await window.api.cancelPhase(buildContext(currentPhase))
        setPhaseStatus(currentPhase, 'cancelled')

        const movedFiles = phaseProgress[currentPhase]?.movedFiles
        if (movedFiles && Object.keys(movedFiles).length > 0) {
            setStep('rollback') // We need a rollback view
        }
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
                                    {status === 'cancelled' && <span className="info-tag text-amber" aria-live=\"polite\">Cancelled</span>}
                            </div>
                        </div>

                            {/* Progress section — aria-live so screen readers announce updates */ }
                    {
                        isActive && (
                            <div role="status" aria-live="polite" aria-label={`Phase ${num} progress: ${p.percent || 0}% complete, ${p.processed || 0} of ${p.total || 0} files`}>
                                <ProgressBar percent={p.percent || 0} label={`Phase ${num} progress`} />
                                <div className="phase-stats mt-4">
                                    <div className="phase-stat">
                                        <div className="phase-stat-value">{(p.processed || 0).toLocaleString()}</div>
                                        <div className="phase-stat-label">Processed</div>
                                    </div>
                                    <div className="phase-stat">
                                        <div className="phase-stat-value">{(p.total || 0).toLocaleString()}</div>
                                        <div className="phase-stat-label">Total Files</div>
                                    </div>
                                    {num === 4 && (
                                        <div className="phase-stat">
                                            <div className="phase-stat-value">{formatBytes(p.bytesProcessed || 0)}</div>
                                            <div className="phase-stat-label">of {formatBytes(p.totalBytes || 0)}</div>
                                        </div>
                                    )}
                                    <div className="phase-stat">
                                        <div className="phase-stat-value text-red">{(p.failed || 0).toLocaleString()}</div>
                                        <div className="phase-stat-label">Failed</div>
                                    </div>
                                </div>
                                <PerfRow stats={perfStats} />
                                {num === 4 && p.collision && (
                                    <div className="collision-toast mt-2 p-2 bg-amber-900/20 text-amber-400 rounded text-sm border border-amber-500/30" role="alert" aria-live="assertive">
                                        <span aria-hidden="true">🔄</span>
                                        Collision avoided: file renamed to <strong>{p.lastMove.dst.split('\\').pop()}</strong>
                                    </div>
                                )}
                                {num === 4 && perfStats?.bytesPerSecond > 0 && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', marginTop: '4px' }}>
                                        Throughput: {formatBytes(perfStats.bytesPerSecond)}/s
                                    </div>
                                )}
                            </div>
                        )
                    }

                    {/* Done stats */ }
                    {
                        isDone && num === 1 && (
                            <div className="mt-4">
                                <div className="flex gap-3 mb-4" style={{ flexWrap: 'wrap' }}>
                                    <span className="info-tag">📁 {stats.total.toLocaleString()} files indexed</span>
                                    {Object.entries(stats.byCategory).map(([k, v]) => v > 0 && (
                                        <span key={k} className="info-tag">
                                            {v.toLocaleString()} {k}
                                        </span>
                                    ))}
                                </div>
                                <ScanOverview />
                            </div>
                        )
                    }

                    {
                        isDone && num === 2 && actionPlan && (
                            <div className="mt-4">
                                <div className="flex gap-3 mb-4 flex-between">
                                    <div className="flex gap-2">
                                        <span className="info-tag">📋 Overview of recommendations</span>
                                        {actionPlan.duplicatesCount > 0 && (
                                            <span className="info-tag text-amber">
                                                ⚠️ {actionPlan.duplicatesCount} duplicates ({formatBytes(actionPlan.potentialSavings)} potential savings)
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '12px' }}>
                                    {loadingPreview && previewFiles.length === 0 ? (
                                        <div className="p-8 text-center text-muted">Loading preview…</div>
                                    ) : previewFiles.length > 0 ? (
                                        previewFiles.map((f) => (
                                            <ActionPlanCard
                                                key={f.id}
                                                recommendation={{
                                                    fileId: f.id,
                                                    fileName: f.name,
                                                    srcPath: f.srcPath,
                                                    category: f.category,
                                                    suggestedDst: f.suggestedDst,
                                                    isDuplicate: f.isDuplicate === 1
                                                }}
                                            />
                                        ))
                                    ) : (
                                        <div className="p-8 text-center text-muted">No files found.</div>
                                    )}
                                </div>
                                <div className="flex flex-center gap-4 mt-6 mb-4">
                                    {hasMore && (
                                        <button
                                            className="btn btn-ghost btn-sm border border-muted hover:border-teal-500"
                                            disabled={loadingPreview}
                                            onClick={loadMore}
                                        >
                                            {loadingPreview ? 'Loading…' : '👇 Load More Recommendations'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    }

                    {
                        isDone && num === 5 && p.processed != null && (
                            <div className="flex gap-3 mt-4">
                                <span className="info-tag text-green">✅ {p.processed} files moved</span>
                                {p.renamed > 0 && (
                                    <span className="info-tag text-amber">
                                        ⚠️ {p.renamed} files auto-renamed
                                    </span>
                                )}
                                {p.missing > 0 && <span className="info-tag text-amber">⚠️ {p.missing} not found</span>}
                            </div>
                        )
                    }

                    {
                        num === 3 && status !== 'done' && (
                            <div className="mt-4 p-4 rounded-lg bg-teal-900/20 border border-teal-500/30">
                                <h4 className="flex items-center gap-2 text-teal-400 mb-2">
                                    <span>🛡️ Review Checkpoint</span>
                                </h4>
                                <p className="text-sm text-muted mb-4">
                                    Please review the Action Plan and folder exclusions above.
                                    Once you are satisfied, click the button below to lock in the plan for execution.
                                </p>
                                <button
                                    className="btn btn-primary w-full"
                                    onClick={() => startPhase(3)}
                                    disabled={status === 'running'}
                                >
                                    I Have Reviewed the Plan
                                </button>
                            </div>
                        )
                    }

                    {
                        isDone && num === 7 && p.emptyFolders && (
                            <div className="mt-4">
                                <p className="mb-3">Found <strong>{p.emptyFolders.length}</strong> empty folders after reorganization.</p>
                                <div className="flex gap-2">
                                    <button className="btn btn-danger btn-sm" onClick={() => handleCleanup(p.emptyFolders)}>
                                        Delete All Empty Folders
                                    </button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setPhaseStatus(7, 'skipped')}>
                                        Keep All
                                    </button>
                                </div>
                            </div>
                        )
                    }

                    {/* Action buttons */ }
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
                                    <span aria-hidden=\"true\">{isPaused ? '▶' : '⏸'}</span>
                                {isPaused ? ' Resume' : ' Pause'}
                            </button>
                        <button
                            className="btn btn-danger"
                            onClick={handleCancel}
                            id={`btn-cancel-phase-${num}`}
                            aria-label={`Cancel Phase ${num} and trigger safe rollback`}
                        >
                            <span aria-hidden=\"true\">✕</span> Cancel (Safe Rollback)
                    </button>
                                    </>
                                )}
            {isDone && num === 6 && (
                <button
                    className="btn btn-green"
                    onClick={() => setStep('report')}
                    id=\"btn-view-report\"
            aria-label=\"View full audit report\"
                                    >
            <span aria-hidden=\"true\">📋</span> View Full Report
                                    </button >
                                )
}
                            </div >
                        </div >
                    )
                })}
            </div >

    {/* Backup Prompt Modal triggers from phase 3 */ }
{
    showBackupPrompt && (
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
            stats={stats}
        />
    )
}
        </div >
    )
}

function BackupModal({ onAccept, onSkip, onClose, selectedDrive, stats }) {
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
        const res = await window.api.createBackup(null, destDrive)
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
                    <strong>{(stats?.total || 0).toLocaleString()} files</strong> will be included.
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
