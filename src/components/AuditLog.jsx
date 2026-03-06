import { useEffect, useState } from 'react'

const ACTION_LABELS = {
    MOVED: { label: 'Moved', cls: 'log-MOVED' },
    ERROR: { label: 'Error', cls: 'log-ERROR' },
    BLOCKED: { label: 'Blocked', cls: 'log-BLOCKED' },
    SKIP: { label: 'Skipped', cls: 'log-SKIP' },
    BACKUP_CREATED: { label: 'Backup', cls: 'log-BACKUP_CREATED' },
    ROLLBACK: { label: 'Rollback', cls: 'log-ROLLBACK' },
    BACKUP_FAIL: { label: 'Backup Fail', cls: 'log-ERROR' },
}

function formatBytes(b) {
    if (!b) return '—'
    const k = 1024, s = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(b) / Math.log(k))
    return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}

function formatTs(ts) {
    try { return new Date(ts).toLocaleTimeString() } catch { return ts || '—' }
}

function truncatePath(p = '', max = 40) {
    if (p.length <= max) return p
    return '…' + p.slice(p.length - max)
}

export default function AuditLog() {
    const [logs, setLogs] = useState([])
    const [filter, setFilter] = useState('ALL')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        window.api.getLogs().then(entries => {
            setLogs(entries)
            setLoading(false)
        })
    }, [])

    const filtered = filter === 'ALL' ? logs : logs.filter(l => l.action === filter)
    const actionTypes = ['ALL', ...new Set(logs.map(l => l.action))]

    return (
        <div>
            <div className="section-header">
                <h2>📋 Audit Log</h2>
                <p>Every file action recorded during this session.</p>
            </div>

            <div className="flex gap-3 mb-6 flex-between" style={{ flexWrap: 'wrap' }}>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    {actionTypes.map(t => (
                        <button
                            key={t}
                            className={`btn btn-sm ${filter === t ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setFilter(t)}
                            id={`log-filter-${t.toLowerCase()}`}
                        >
                            {t === 'ALL' ? `All (${logs.length})` : (ACTION_LABELS[t]?.label || t)}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => window.api.exportReport('json')}
                        id="btn-export-json"
                    >
                        ⬇️ JSON
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => window.api.exportReport('csv')}
                        id="btn-export-csv"
                    >
                        ⬇️ CSV
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="empty-state">
                    <div className="empty-icon">⏳</div>
                    <p>Loading log entries…</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">📭</div>
                    <p>No log entries {filter !== 'ALL' ? `for filter: ${filter}` : 'yet'}.</p>
                </div>
            ) : (
                <div className="log-table-wrap">
                    <table className="log-table">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Phase</th>
                                <th>Action</th>
                                <th>Source</th>
                                <th>Destination</th>
                                <th>Size</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.slice(-500).reverse().map((entry, i) => {
                                const meta = ACTION_LABELS[entry.action] || { label: entry.action, cls: '' }
                                return (
                                    <tr key={i}>
                                        <td>{formatTs(entry.ts)}</td>
                                        <td>{entry.phase || '—'}</td>
                                        <td><span className={`log-action ${meta.cls}`}>{meta.label}</span></td>
                                        <td title={entry.srcPath}>{truncatePath(entry.srcPath)}</td>
                                        <td title={entry.dstPath}>{truncatePath(entry.dstPath)}</td>
                                        <td>{formatBytes(entry.size)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    {filtered.length > 500 && (
                        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                            Showing last 500 of {filtered.length.toLocaleString()} entries. Export for full log.
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
