import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export default function ReportView() {
    const { report, setStep, currentPhase, phaseProgress } = useAppStore()
    const [filter, setFilter] = useState('ALL')
    const [search, setSearch] = useState('')
    const [exporting, setExporting] = useState(false)

    if (!report || !report.logs) {
        return (
            <div className="p-8 text-center">
                <h3>No report data available.</h3>
                <button className="btn btn-primary mt-4" onClick={() => setStep('phase')}>Return to Engine</button>
            </div>
        )
    }

    const { logs, summary } = report

    const filteredLogs = logs.filter(log => {
        if (filter !== 'ALL' && log.action !== filter) return false
        if (search) {
            const s = search.toLowerCase()
            return (log.srcPath?.toLowerCase().includes(s) || log.dstPath?.toLowerCase().includes(s))
        }
        return true
    })

    const handleExport = async (format) => {
        setExporting(true)
        try {
            await window.api.exportReport(format)
        } finally {
            setExporting(false)
        }
    }

    const formatBytes = (bytes) => {
        if (!bytes) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div className="section-header">
                <div className="sub">Post-Execution Audit</div>
                <h2>Session Summary Report</h2>
                <p>Detailed verification of all file operations performed during this session.</p>
            </div>

            <div className="grid-4 mb-6">
                <div className="stat-card">
                    <div className="val text-green">{summary.moved || 0}</div>
                    <div className="lab">Files Moved</div>
                </div>
                <div className="stat-card">
                    <div className="val">{formatBytes(summary.totalBytes || 0)}</div>
                    <div className="lab">Total Size</div>
                </div>
                <div className="stat-card">
                    <div className="val text-amber">{summary.blocked || 0}</div>
                    <div className="lab">Blocked</div>
                </div>
                <div className="stat-card">
                    <div className="val text-red">{summary.errors || 0}</div>
                    <div className="lab">Errors</div>
                </div>
            </div>

            <div className="card">
                <div className="flex flex-between mb-4 flex-wrap gap-4">
                    <div className="flex gap-2">
                        <button className={`btn btn-sm ${filter === 'ALL' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('ALL')}>All</button>
                        <button className={`btn btn-sm ${filter === 'MOVED' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('MOVED')}>Moved</button>
                        <button className={`btn btn-sm ${filter === 'ERROR' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('ERROR')}>Errors</button>
                        <button className={`btn btn-sm ${filter === 'BLOCKED' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('BLOCKED')}>Blocked</button>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            className="dest-input"
                            placeholder="Search paths..."
                            style={{ width: '200px', padding: '4px 12px' }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <button className="btn btn-ghost btn-sm" onClick={() => handleExport('html')}>Export HTML</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleExport('csv')}>Export CSV</button>
                    </div>
                </div>

                <div style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1, borderBottom: '1px solid var(--border-color)' }}>
                            <tr>
                                <th style={{ padding: '8px', textAlign: 'left' }}>Action</th>
                                <th style={{ padding: '8px', textAlign: 'left' }}>File</th>
                                <th style={{ padding: '8px', textAlign: 'left' }}>Destination</th>
                                <th style={{ padding: '8px', textAlign: 'right' }}>Size</th>
                                <th style={{ padding: '8px', textAlign: 'left' }}>Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.map((log, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '8px' }}>
                                        <span className={`info-tag ${log.action === 'MOVED' ? 'text-green' : log.action === 'ERROR' ? 'text-red' : 'text-amber'}`} style={{ fontSize: '10px' }}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td style={{ padding: '8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.srcPath}>
                                        {log.srcPath?.split(/[\\/]/).pop()}
                                    </td>
                                    <td style={{ padding: '8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.dstPath}>
                                        {log.dstPath?.split(/[\\/]/).pop()}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatBytes(log.size)}</td>
                                    <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{log.status || log.error || log.reason || 'OK'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex flex-end mt-8">
                <button className="btn btn-primary" onClick={() => setStep('phase')}>Return to Phase Engine</button>
            </div>
        </div>
    )
}
