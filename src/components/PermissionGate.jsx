import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export default function PermissionGate() {
    const { setStep } = useAppStore()
    const [agreed, setAgreed] = useState(false)
    const [settings, setSettings] = useState(null)

    useEffect(() => {
        window.api.getSettings().then(setSettings)
    }, [])

    const handleApprove = async () => {
        if (!agreed) return
        await window.api.updateSettings({ firstRun: false })
        setStep('drive')
    }

    if (settings && settings.firstRun === false) {
        // Fallback: This component shouldn't be shown if firstRun is false,
        // but if it is, let the user manually continue.
    }

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '40px' }}>
            <div className="section-header">
                <div className="sub">Welcome to WhereDidIPutThat</div>
                <h2>Filesystem Access Request</h2>
                <p>Before we begin organizing your files, we need to establish a secure boundary for the application.</p>
            </div>

            <div className="card mb-6" style={{ background: 'rgba(56,189,248,0.03)' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--accent-teal)' }}>How it works:</h4>
                <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '20px', lineHeight: '1.8' }}>
                    <li><strong>Exclusive Scope:</strong> You select <u>one</u> drive and <u>specific</u> folders. The app is physically blocked from touching anything else.</li>
                    <li><strong>Safety Guardrails:</strong> System directories (Windows, Program Files, etc.) are hard-blocked at the kernel-level wrapper and cannot be accessed.</li>
                    <li><strong>Offline & Local:</strong> No data ever leaves your computer. All processing happens in this standalone window.</li>
                    <li><strong>Rollback Protection:</strong> A mandatory backup is recommended before any file is moved.</li>
                </ul>
            </div>

            <div className={`checkbox-row ${agreed ? 'checked' : ''}`} onClick={() => setAgreed(!agreed)}>
                <div className="custom-checkbox">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" stroke="currentColor">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <div className="checkbox-label">
                    I understand that I am granting this application permission to scan my selected folders.
                </div>
            </div>

            <div className="flex gap-3 flex-end mt-8">
                <button
                    className="btn btn-primary btn-lg"
                    disabled={!agreed}
                    onClick={handleApprove}
                    id="btn-approve-permissions"
                >
                    Approve and Continue
                </button>
            </div>
        </div>
    )
}
