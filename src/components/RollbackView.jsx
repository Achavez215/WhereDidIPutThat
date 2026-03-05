import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export default function RollbackView() {
    const { phaseProgress, currentPhase, setStep } = useAppStore()
    const [progress, setProgress] = useState(null)
    const [status, setStatus] = useState('preparing')

    const movedFiles = phaseProgress[currentPhase]?.movedFiles || {}
    const entries = Object.keys(movedFiles)

    useEffect(() => {
        window.api.onRollbackProgress((data) => {
            setProgress(data)
            if (data.status === 'done') setStatus('done')
        })
        return () => window.api.removeRollbackListeners()
    }, [])

    const handleStartRollback = async () => {
        setStatus('running')
        await window.api.startRollback(movedFiles)
    }

    return (
        <div style={{ maxWidth: '600px', margin: 'auto', paddingTop: '40px' }}>
            <div className="section-header">
                <div className="sub">Safe Rollback</div>
                <h2>Reversing Operations</h2>
                <p>The system is prepared to return moved files to their original locations.</p>
            </div>

            <div className="card">
                <h4 className="mb-4">Rollback Summary</h4>
                <div className="flex flex-between mb-4">
                    <span>Files to reverse:</span>
                    <span className="font-bold">{entries.length}</span>
                </div>

                {status === 'preparing' && (
                    <button className="btn btn-primary w-full" onClick={handleStartRollback}>
                        Start Safe Rollback Now
                    </button>
                )}

                {status === 'running' && progress && (
                    <div>
                        <div className="progress-bar-wrap mb-4">
                            <div className="progress-bar-fill" style={{ width: `${progress.percent || 0}%` }} />
                        </div>
                        <div className="flex flex-between text-sm">
                            <span>{progress.processed} / {progress.total} restored</span>
                            <span className="text-red">{progress.failed} failed</span>
                        </div>
                    </div>
                )}

                {status === 'done' && (
                    <div className="text-center">
                        <div className="text-green mb-4" style={{ fontSize: '48px' }}>✓</div>
                        <p className="mb-6">Rollback complete. {progress?.processed} files restored.</p>
                        <button className="btn btn-primary w-full" onClick={() => setStep('phase')}>
                            Return to Engine
                        </button>
                    </div>
                )}
            </div>

            <div className="mt-8">
                <button className="btn btn-ghost" onClick={() => setStep('phase')} disabled={status === 'running'}>
                    ← Abandon Rollback (Keep current state)
                </button>
            </div>
        </div>
    )
}
