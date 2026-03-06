import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'

function formatBytes(b) {
    if (!b) return '0 B'
    const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(b) / Math.log(k))
    return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}

function StorageBar({ free, total }) {
    const used = total - free
    const pct = total > 0 ? (used / total) * 100 : 0
    let variant = ''
    if (pct > 90) variant = 'danger'
    else if (pct > 75) variant = 'warning'

    return (
        <div className="storage-bar-container" aria-hidden="true">
            <div className={`storage-bar-fill ${variant}`} style={{ width: `${pct}%` }} />
        </div>
    )
}

function DriveCardSecondary({ drive, selected, onSelect, onExpand, expanded, folders }) {
    const icon = drive.isCloud ? '☁️' : drive.driveType === 2 ? '💾' : drive.isSystem ? '💻' : '🗄️'
    const typeClass = drive.isCloud ? 'cloud' : drive.driveType === 2 ? 'removable' : drive.driveType === 4 ? 'network' : ''

    return (
        <div className={`drive-card-secondary ${selected ? 'selected' : ''} ${typeClass}`}>
            <div className="flex flex-between items-center mb-2" onClick={onSelect} style={{ cursor: 'pointer' }}>
                <div className="flex items-center gap-2">
                    <span style={{ fontSize: 20 }}>{icon}</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{drive.label} ({drive.letter})</span>
                </div>
                <div className="health-indicator">
                    <div className={`health-dot ${drive.status === 'OK' ? 'ok' : 'warn'}`} />
                    {drive.status === 'OK' ? 'Healthy' : drive.status}
                </div>
            </div>

            <div className="drive-meta flex gap-2 mb-2" onClick={onSelect}>
                <span className="info-tag" style={{ fontSize: 9 }}>{drive.typeLabel}</span>
                <span className="info-tag" style={{ fontSize: 9 }}>{drive.fileSystem}</span>
                {drive.isSystem && <span className="info-tag system" style={{ fontSize: 9 }}>System</span>}
            </div>

            <StorageBar free={drive.freeBytes} total={drive.totalBytes} />

            <div className="flex flex-between text-muted" style={{ fontSize: 11 }}>
                <span>{formatBytes(drive.freeBytes)} free</span>
                <span>{formatBytes(drive.totalBytes)}</span>
            </div>

            <button
                className="btn btn-ghost btn-xs w-full mt-3"
                onClick={(e) => { e.stopPropagation(); onExpand(); }}
                aria-expanded={expanded}
            >
                {expanded ? '▲ Hide Folders' : '▼ Preview Folders'}
            </button>

            {expanded && (
                <div className={`folders-preview expanded`}>
                    {folders === null ? (
                        <div className="p-2 text-center">Loading...</div>
                    ) : folders.length === 0 ? (
                        <div className="p-2 text-center">No folders found</div>
                    ) : (
                        folders.map(f => (
                            <div key={f.fullPath} className="preview-item">
                                📁 {f.name}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

function ThisPCCard({ data, selected, onSelect }) {
    return (
        <div className={`drive-card-primary ${selected ? 'selected' : ''}`} onClick={onSelect}>
            <div className="icon-main">🖥️</div>
            <div style={{ flex: 1 }}>
                <div className="flex flex-between items-center mb-1">
                    <h3 style={{ margin: 0, fontSize: 20 }}>This PC</h3>
                    <div className="badge accent">UNIFIED SYSTEM SCAN</div>
                </div>
                <p className="text-muted mb-4" style={{ fontSize: 13 }}>
                    Analyze all <strong>{data?.driveCount || 0}</strong> connected drives simultaneously.
                </p>
                <div style={{ maxWidth: 400 }}>
                    <StorageBar free={data?.freeBytes || 0} total={data?.totalBytes || 0} />
                    <div className="flex flex-between text-muted" style={{ fontSize: 12 }}>
                        <span>Collective: {formatBytes(data?.freeBytes || 0)} free of {formatBytes(data?.totalBytes || 0)}</span>
                    </div>
                </div>
            </div>
            <div className="flex flex-column gap-2 items-end">
                <button className={`btn ${selected ? 'btn-primary' : 'btn-ghost'}`}>
                    {selected ? 'Selected ✓' : 'Select This PC'}
                </button>
            </div>
        </div>
    )
}

export default function DriveSelector() {
    const {
        drives, thisPC, selectedDrives, isScanningAll, setDrives,
        toggleDrive, setThisPCSelected, setStep, setTopLevelFolders
    } = useAppStore()

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [cloudConfirm, setCloudConfirm] = useState(null)
    const [expandedDrive, setExpandedDrive] = useState(null)
    const [driveFolders, setDriveFolders] = useState({})
    const [scanType, setScanType] = useState('quick') // 'quick' | 'deep'

    useEffect(() => {
        setLoading(true)
        window.api.listDrives().then(res => {
            if (res.ok) setDrives({ drives: res.drives, thisPC: res.thisPC })
            else setError(res.error)
            setLoading(false)
        })
    }, [])

    const handleExpand = async (drive) => {
        if (expandedDrive === drive.letter) {
            setExpandedDrive(null)
            return
        }
        setExpandedDrive(drive.letter)
        if (!driveFolders[drive.letter]) {
            const res = await window.api.listTopLevelFolders(drive.mountPath)
            if (res.ok) {
                setDriveFolders(prev => ({ ...prev, [drive.letter]: res.folders }))
            }
        }
    }

    const handleSelectDrive = (drive) => {
        if (drive.isCloud && !selectedDrives.find(d => d.letter === drive.letter)) {
            setCloudConfirm(drive)
            return
        }
        toggleDrive(drive)
    }

    const confirmCloudSelect = (drive) => {
        toggleDrive(drive)
        setCloudConfirm(null)
    }

    const handleContinue = async () => {
        if (isScanningAll) {
            // In "This PC" mode, we might scan everything or proceed to folder selection for all
            // For now, let's aggregate and proceed
            const allFolders = []
            for (const drive of drives) {
                const res = await window.api.listTopLevelFolders(drive.mountPath)
                if (res.ok) allFolders.push(...res.folders)
            }
            setTopLevelFolders(allFolders)
        } else if (selectedDrives.length === 1) {
            const res = await window.api.listTopLevelFolders(selectedDrives[0].mountPath)
            if (res.ok) setTopLevelFolders(res.folders)
        } else if (selectedDrives.length > 0) {
            const paths = selectedDrives.map(d => d.mountPath)
            const allFolders = []
            for (const path of paths) {
                const res = await window.api.listTopLevelFolders(path)
                if (res.ok) allFolders.push(...res.folders)
            }
            setTopLevelFolders(allFolders)
        }
        setStep('folders')
    }

    const canContinue = selectedDrives.length > 0 || isScanningAll

    return (
        <div>
            <div className="section-header">
                <div className="sub">Step 1 of 6</div>
                <h2>Drive Discovery & Selection</h2>
                <p>Choose where to look. Select individual drives or scan the entire system.</p>
            </div>

            {loading && (
                <div className="alert alert-info"><span className="alert-icon">🔍</span> Scanning available drives…</div>
            )}
            {error && (
                <div className="alert alert-error"><span className="alert-icon">⚠️</span> {error}</div>
            )}

            <div className="mb-6">
                <ThisPCCard
                    data={thisPC}
                    selected={isScanningAll}
                    onSelect={() => setThisPCSelected(!isScanningAll)}
                />
            </div>

            <div className="settings-controls-box mb-6">
                <div className="grid-2">
                    <div className="checkbox-row checked" onClick={() => { }}>
                        <div className="custom-checkbox">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div className="checkbox-label">
                            Skip System & Library Folders
                            <div className="checkbox-sub">Protects Windows, Program Files, etc. (Recommended)</div>
                        </div>
                    </div>
                    <div className="checkbox-row" onClick={() => { }}>
                        <div className="custom-checkbox">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div className="checkbox-label">
                            Filter Specific File Types
                            <div className="checkbox-sub">Scan only for Images, Documents, Videos, etc.</div>
                        </div>
                    </div>
                </div>
            </div>

            {isScanningAll && (
                <div className="alert scan-warning-box mb-6">
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <span style={{ fontSize: 24 }}>🛡️</span>
                        <div style={{ flex: 1 }}>
                            <h4 style={{ margin: 0, color: 'var(--accent-amber)' }}>Full System Scan Mode</h4>
                            <p style={{ fontSize: 12, margin: '4px 0 0' }}>
                                Scanning all drives will take significantly longer.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                className={`btn btn-sm ${scanType === 'quick' ? 'btn-amber' : 'btn-ghost'}`}
                                onClick={() => setScanType('quick')}
                            >Quick</button>
                            <button
                                className={`btn btn-sm ${scanType === 'deep' ? 'btn-amber' : 'btn-ghost'}`}
                                onClick={() => setScanType('deep')}
                            >Deep</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="drive-grid">
                {drives.map(drive => (
                    <DriveCardSecondary
                        key={drive.letter}
                        drive={drive}
                        selected={selectedDrives.some(d => d.letter === drive.letter)}
                        onSelect={() => handleSelectDrive(drive)}
                        onExpand={() => handleExpand(drive)}
                        expanded={expandedDrive === drive.letter}
                        folders={driveFolders[drive.letter] || null}
                    />
                ))}
            </div>

            {!loading && drives.length === 0 && (
                <div className="empty-state">
                    <div className="empty-icon">💽</div>
                    <p>No drives detected.</p>
                </div>
            )}

            <div className="flex gap-3 flex-end mt-6">
                <button
                    className="btn btn-primary btn-lg"
                    disabled={!canContinue}
                    onClick={handleContinue}
                    id="btn-continue-to-folders"
                >
                    Confirm Selection & Continue →
                </button>
            </div>

            {cloudConfirm && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>☁️ Cloud Drive Selected</h3>
                        <p>
                            <strong>{cloudConfirm.label} ({cloudConfirm.letter})</strong> appears to be a cloud storage location.
                            Organizing files here may affect cloud sync behaviour.
                            Are you sure you want to proceed?
                        </p>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setCloudConfirm(null)}>Cancel</button>
                            <button className="btn btn-amber" onClick={() => confirmCloudSelect(cloudConfirm)} id="btn-confirm-cloud">
                                Yes, Use Cloud Drive
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
