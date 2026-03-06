import { useState, useEffect } from 'react'

export default function SettingsScreen() {
    const [settings, setSettings] = useState(null)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        window.api.getSettings().then(setSettings)
    }, [])

    const handleUpdate = async (patch) => {
        const newSettings = await window.api.updateSettings(patch)
        setSettings(newSettings)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    if (!settings) return <div className="p-8">Loading settings...</div>

    return (
        <div style={{ maxWidth: '800px' }}>
            <div className="section-header">
                <div className="sub">Configuration Center</div>
                <h2>Application Settings</h2>
                <p>Manage your safety preferences, backup retention, and interface behavior.</p>
            </div>

            <div className="grid-2">
                <div className="card">
                    <h3 className="mb-4" style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>🛡️</span> Safety Toggles
                    </h3>

                    <div className={`checkbox-row mb-3 ${settings.safety.dryRunDefault ? 'checked' : ''}`}
                        onClick={() => handleUpdate({ safety: { ...settings.safety, dryRunDefault: !settings.safety.dryRunDefault } })}>
                        <div className="custom-checkbox">
                            {settings.safety.dryRunDefault && <span style={{ color: '#000' }}>✓</span>}
                        </div>
                        <div className="checkbox-label">
                            <div style={{ fontSize: '13px' }}>Default to Dry Run</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Analyze without moving files</div>
                        </div>
                    </div>

                    <div className={`checkbox-row ${settings.safety.backupBeforeMove ? 'checked' : ''}`}
                        onClick={() => handleUpdate({ safety: { ...settings.safety, backupBeforeMove: !settings.safety.backupBeforeMove } })}>
                        <div className="custom-checkbox">
                            {settings.safety.backupBeforeMove && <span style={{ color: '#000' }}>✓</span>}
                        </div>
                        <div className="checkbox-label">
                            <div style={{ fontSize: '13px' }}>Force Backup Before Move</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Recommended for security</div>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h3 className="mb-4" style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📦</span> Backup Retention
                    </h3>

                    <div className={`checkbox-row mb-3 ${settings.retention.autoDeleteBackups ? 'checked' : ''}`}
                        onClick={() => handleUpdate({ retention: { ...settings.retention, autoDeleteBackups: !settings.retention.autoDeleteBackups } })}>
                        <div className="custom-checkbox">
                            {settings.retention.autoDeleteBackups && <span style={{ color: '#000' }}>✓</span>}
                        </div>
                        <div className="checkbox-label">
                            <div style={{ fontSize: '13px' }}>Auto-Delete Old Backups</div>
                        </div>
                    </div>

                    <div className="mt-4">
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                            Keep backups for (days)
                        </label>
                        <input
                            type="number"
                            className="dest-input"
                            style={{ width: '80px' }}
                            value={settings.retention.daysToKeep}
                            onChange={(e) => handleUpdate({ retention: { ...settings.retention, daysToKeep: parseInt(e.target.value) || 0 } })}
                        />
                    </div>
                </div>
            </div>

            <div className="card mt-6">
                <h3 className="mb-4" style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🚀</span> Application Updates
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    The app automatically checks for updates on launch. You can also manually trigger a check here.
                </p>
                <div className="flex gap-3">
                    <button className="btn btn-primary" onClick={() => window.api.checkForUpdates()}>
                        Check for Updates Now
                    </button>
                    <span className="text-muted" style={{ fontSize: '12px' }}>Current Version: v1.0.0</span>
                </div>
            </div>

            {saved && (
                <div style={{
                    position: 'fixed', bottom: '24px', right: '24px',
                    background: 'var(--accent-green)', color: '#000',
                    padding: '8px 16px', borderRadius: '4px', fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    animation: 'fadeIn 0.2s ease'
                }}>
                    ✓ Settings Saved
                </div>
            )}
        </div>
    )
}
