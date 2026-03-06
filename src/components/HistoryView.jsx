// deno-lint-ignore-file no-window
import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export default function HistoryView() {
    const { driveRoot, setStep } = useAppStore()
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [rollbackId, setRollbackId] = useState(null)
    const [rollbackProgress, setRollbackProgress] = useState(null)

    useEffect(() => {
        loadHistory()
        window.api.onHistoryUndoProgress((progress) => {
            setRollbackProgress(progress)
            if (progress.status === 'done' || progress.status === 'complete') {
                loadHistory()
                setTimeout(() => {
                    setRollbackId(null)
                    setRollbackProgress(null)
                }, 3000)
            }
        })
        return () => window.api.removeHistoryListeners()
    }, [driveRoot])

    const loadHistory = async () => {
        setLoading(true)
        const data = await window.api.getHistory(driveRoot || 'C:\\')
        setHistory(data)
        setLoading(false)
    }

    const handleUndo = async (session) => {
        const msg = `Are you sure you want to undo the organization from ${new Date(session.date).toLocaleString()}?
This will move ${session.fileCount} files back to their original locations.`

        if (!window.confirm(msg)) return

        setRollbackId(session.id)
        setRollbackProgress({ percent: 0, processed: 0, total: session.fileCount })

        try {
            await window.api.undoSession(session.id, driveRoot || 'C:\\')
        } catch (err) {
            alert(`Undo failed: ${err.message}`)
            setRollbackId(null)
        }
    }

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div className="section-header">
                <div className="sub">Session Management</div>
                <h2>Operation History</h2>
                <p>View and manage your previous organization runs on this drive.</p>
            </div>

            {loading ? (
                <div className="p-12 text-center text-muted">Loading history...</div>
            ) : history.length === 0 ? (
                <div className="card text-center p-12">
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
                    <h3>No past sessions found.</h3>
                    <p className="text-muted">Once you complete an organization run with a backup, it will appear here.</p>
                    <button className="btn btn-primary mt-6" onClick={() => setStep('drive')}>Start New Run</button>
                </div>
            ) : (
                <div className="grid gap-4">
                    {history.map(session => (
                        <div key={session.id} className="card relative overflow-hidden">
                            {rollbackId === session.id && (
                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 z-10">
                                    <div className="text-amber mb-2 font-bold">Undoing Operation...</div>
                                    <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden mb-2">
                                        <div className="bg-amber h-full transition-all" style={{ width: `${rollbackProgress?.percent || 0}%` }} />
                                    </div>
                                    <div className="text-xs text-muted">
                                        {rollbackProgress?.processed || 0} / {rollbackProgress?.total || 0} files restored
                                    </div>
                                    {rollbackProgress?.status === 'done' && (
                                        <div className="text-green mt-2 font-bold">✓ Rollback Complete</div>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-between items-center">
                                <div>
                                    <div className="font-bold text-lg">{new Date(session.date).toLocaleDateString()}</div>
                                    <div className="text-sm text-muted">{new Date(session.date).toLocaleTimeString()}</div>
                                </div>
                                <div className="text-right">
                                    <div className="info-tag mb-1">{session.fileCount} Files</div>
                                    <div className={`text-xs ${session.hasBackup ? 'text-green' : 'text-red'}`}>
                                        {session.hasBackup ? 'Backup Ready' : 'No Backup Available'}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-white/5 flex flex-between items-center">
                                <div className="text-xs font-mono text-muted">{session.id}</div>
                                <div className="flex gap-2">
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        disabled={!session.hasBackup || !!rollbackId}
                                        onClick={() => handleUndo(session)}
                                    >
                                        ⏪ Undo Run
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-8 flex flex-end">
                <button className="btn btn-ghost" onClick={() => setStep('drive')}>← Return to Scanner</button>
            </div>
        </div>
    )
}
