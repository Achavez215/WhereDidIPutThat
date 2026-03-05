import React, { useState } from 'react'
import { useAppStore } from '../store/appStore'
import AuditLog from './AuditLog'

export default function ReportScreen() {
    const { report, backupPath, setBackupDisposition } = useAppStore()
    const [backupAction, setBackupAction] = useState(null)
    const [backupDone, setBackupDone] = useState(false)
    const [tab, setTab] = useState('summary') // 'summary' | 'log'

    const handleDeleteBackup = async () => {
        if (!backupPath) return
        const res = await window.api.deleteBackup(backupPath)
        if (res.ok) {
            setBackupDone(true)
            setBackupDisposition('deleted')
        }
    }

    return (
        <div>
            <div className="section-header" role="region" aria-labelledby="report-title">
                <div className="sub" aria-hidden="true">Complete</div>
                <h2 id="report-title">✅ Organization Complete</h2>
                <p>The phased execution has finished. Review the results below and manage your backup.</p>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-2 mb-6" role="tablist" aria-label="Report views">
                <button
                    className={`btn btn-sm ${tab === 'summary' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setTab('summary')}
                    id="tab-summary"
                    role="tab"
                    aria-selected={tab === 'summary'}
                    aria-controls="tabpanel-summary"
                ><span aria-hidden="true">📊</span> Summary</button>
                <button
                    className={`btn btn-sm ${tab === 'log' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setTab('log')}
                    id="tab-log"
                    role="tab"
                    aria-selected={tab === 'log'}
                    aria-controls="tabpanel-log"
                ><span aria-hidden="true">📋</span> Full Log</button>
            </div>

            {tab === 'summary' && (
                <div
                    id="tabpanel-summary"
                    role="tabpanel"
                    aria-labelledby="tab-summary"
                    aria-live="polite"
                >
                    {report ? (
                        <>
                            <div className="report-grid mb-6">
                                <div className="report-stat green" aria-label={`${report.moved} files moved successfully`}>
                                    <div className="report-stat-value">{(report.moved || 0).toLocaleString()}</div>
                                    <div className="report-stat-label">Files Moved</div>
                                </div>
                                <div className="report-stat red" aria-label={`${report.errors} files encountered errors`}>
                                    <div className="report-stat-value">{(report.errors || 0).toLocaleString()}</div>
                                    <div className="report-stat-label">Errors</div>
                                </div>
                                <div className="report-stat amber" aria-label={`${report.blocked} files were blocked by safety guard`}>
                                    <div className="report-stat-value">{(report.blocked || 0).toLocaleString()}</div>
                                    <div className="report-stat-label">Blocked</div>
                                </div>
                                <div className="report-stat muted" aria-label={`${report.skipped} files were skipped`}>
                                    <div className="report-stat-value">{(report.skipped || 0).toLocaleString()}</div>
                                    <div className="report-stat-label">Skipped</div>
                                </div>
                            </div>

                            {/* Error Details Section (Low-priority compliance item) */}
                            {report.errorDetails?.length > 0 && (
                                <div className="card mb-6" style={{ borderColor: 'var(--accent-red)' }}>
                                    <h3 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
                                        <span aria-hidden="true">❌</span> Failed Items
                                    </h3>
                                    <div className="log-table-wrap">
                                        <table className="log-table">
                                            <thead>
                                                <tr>
                                                    <th>File</th>
                                                    <th>Error</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {report.errorDetails.map((err, i) => (
                                                    <tr key={i}>
                                                        <td className="mono">{err.file}</td>
                                                        <td className="text-red">{err.message}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="alert alert-warn mb-6" role="alert">
                            <span className="alert-icon" aria-hidden="true">⚠️</span>
                            <span>No report data available. Phased execution may not have completed.</span>
                        </div>
                    )}

                    {/* Backup management */}
                    {backupPath && !backupDone && (
                        <div className="card mb-6">
                            <h3 style={{ marginBottom: 8, fontSize: 15, fontWeight: 600 }}>🛡️ Backup Management</h3>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                                Your backup is stored at: <span className="mono text-teal" style={{ fontSize: 11 }}>{backupPath}</span>
                            </p>
                            {!backupAction ? (
                                <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
                                    <button className="btn btn-danger" onClick={() => setBackupAction('delete-confirm')} id="btn-delete-backup">
                                        🗑️ Delete Backup Now
                                    </button>
                                    <button className="btn btn-ghost" onClick={() => { setBackupAction('kept'); setBackupDone(true); setBackupDisposition('kept') }} id="btn-keep-backup">
                                        💾 Keep Backup
                                    </button>
                                </div>
                            ) : backupAction === 'delete-confirm' ? (
                                <div>
                                    <div className="alert alert-error mb-4">
                                        <span className="alert-icon">⚠️</span>
                                        <span>This permanently removes the backup folder. Are you absolutely sure?</span>
                                    </div>
                                    <div className="flex gap-3">
                                        <button className="btn btn-ghost" onClick={() => setBackupAction(null)} id="btn-cancel-delete-backup">Cancel</button>
                                        <button className="btn btn-danger" onClick={handleDeleteBackup} id="btn-confirm-delete-backup">Yes, Delete Backup</button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                    {backupDone && (
                        <div className="alert alert-success mb-6">
                            <span className="alert-icon">✅</span>
                            <span>Backup has been deleted successfully.</span>
                        </div>
                    )}
                    {!backupPath && (
                        <div className="alert alert-info mb-6">
                            <span className="alert-icon">ℹ️</span>
                            <span>No backup was created for this session.</span>
                        </div>
                    )}

                    {report?.generatedAt && (
                        <div className="info-tag mt-2">
                            Report generated: {new Date(report.generatedAt).toLocaleString()}
                        </div>
                    )}

                    <div className="flex gap-3 mt-6">
                        <button className="btn btn-ghost" onClick={() => window.api.exportReport('json')} id="btn-report-export-json">
                            ⬇️ Export JSON Report
                        </button>
                        <button className="btn btn-ghost" onClick={() => window.api.exportReport('csv')} id="btn-report-export-csv" aria-label="Export report as CSV">
                            ⬇️ Export CSV Report
                        </button>
                    </div>
                </div>
            )}

            {tab === 'log' && (
                <div
                    id="tabpanel-log"
                    role="tabpanel"
                    aria-labelledby="tab-log"
                >
                    <AuditLog />
                </div>
            )}
        </div>
    )
}
