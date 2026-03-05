import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'

function formatBytes(b) {
    if (!b) return '0 B'
    const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(b) / Math.log(k))
    return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}

function DriveCard({ drive, selected, onSelect }) {
    const usedBytes = drive.totalBytes - drive.freeBytes
    const usedPct = drive.totalBytes > 0 ? (usedBytes / drive.totalBytes) * 100 : 0

    const icon = drive.isCloud ? '☁️' : drive.driveType === 2 ? '💾' : drive.isSystem ? '💻' : '🗄️'

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
        }
    }

    return (
        <div
            className={`card drive-card ${selected ? 'selected' : ''} ${drive.isCloud ? 'warning' : ''}`}
            onClick={onSelect}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            id={`drive-${drive.letter.replace(':', '')}`}
            role="button"
            aria-pressed={selected}
            aria-label={`Drive ${drive.letter} — ${drive.label}${drive.isSystem ? ', System drive' : ''}${drive.isCloud ? ', Cloud drive' : ''}${drive.totalBytes > 0 ? `, ${formatBytes(drive.freeBytes)} free of ${formatBytes(drive.totalBytes)}` : ''}`}
        >
            {drive.isCloud && <span className="cloud-overlay" aria-hidden="true">☁</span>}
            <div className="drive-icon" aria-hidden="true">{icon}</div>
            <div className="drive-letter">{drive.letter}</div>
            <div className="drive-label">{drive.label}</div>
            <div className="drive-meta" aria-hidden="true">
                <span className={`pill ${drive.isCloud ? 'cloud' : ''}`}>
                    {drive.isCloud ? 'Cloud' : drive.typeLabel}
                </span>
                {drive.isSystem && <span className="pill system">System</span>}
            </div>
            {drive.totalBytes > 0 && (
                <div className="drive-storage mt-4" aria-hidden="true">
                    <div className="drive-storage-text">
                        {formatBytes(drive.freeBytes)} free of {formatBytes(drive.totalBytes)}
                    </div>
                    <div className="drive-storage-bar mt-2">
                        <div className="drive-storage-bar-fill" style={{ width: `${usedPct}%` }} />
                    </div>
                </div>
            )}
        </div>
    )
}

export default function DriveSelector() {
    const { drives, selectedDrive, setDrives, selectDrive, setStep, setTopLevelFolders } = useAppStore()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [cloudConfirm, setCloudConfirm] = useState(null)

    useEffect(() => {
        setLoading(true)
        window.api.listDrives().then(res => {
            if (res.ok) setDrives(res.drives)
            else setError(res.error)
            setLoading(false)
        })
    }, [])

    const handleSelect = (drive) => {
        if (drive.isCloud && selectedDrive?.letter !== drive.letter) {
            setCloudConfirm(drive)
            return
        }
        confirmSelect(drive)
    }

    const confirmSelect = async (drive) => {
        setCloudConfirm(null)
        selectDrive(drive)
        const res = await window.api.listTopLevelFolders(drive.mountPath)
        if (res.ok) setTopLevelFolders(res.folders)
    }

    const canContinue = !!selectedDrive

    return (
        <div>
            <div className="section-header">
                <div className="sub">Step 1 of 6</div>
                <h2>Select a Drive</h2>
                <p>Choose which drive to organize. Only one drive can be active per session. Cloud drives require explicit selection.</p>
            </div>

            {loading && (
                <div className="alert alert-info"><span className="alert-icon">🔍</span> Scanning available drives…</div>
            )}
            {error && (
                <div className="alert alert-error"><span className="alert-icon">⚠️</span> {error}</div>
            )}

            <div className="alert alert-warn">
                <span className="alert-icon">🛡️</span>
                <span>System directories (Windows, Program Files, AppData, etc.) are always protected and will never be modified regardless of selection.</span>
            </div>

            <div className="grid-auto mb-6">
                {drives.map(drive => (
                    <DriveCard
                        key={drive.letter}
                        drive={drive}
                        selected={selectedDrive?.letter === drive.letter}
                        onSelect={() => handleSelect(drive)}
                    />
                ))}
                {!loading && drives.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-icon">💽</div>
                        <p>No drives detected.</p>
                    </div>
                )}
            </div>

            {selectedDrive && (
                <div className="alert alert-info">
                    <span className="alert-icon">✅</span>
                    <span>Selected: <strong>{selectedDrive.letter}</strong> — {selectedDrive.label}</span>
                </div>
            )}

            <div className="flex gap-3 flex-end mt-6">
                <button
                    className="btn btn-primary btn-lg"
                    disabled={!canContinue}
                    onClick={() => setStep('folders')}
                    id="btn-continue-to-folders"
                >
                    Choose Folders →
                </button>
            </div>

            {/* Cloud confirmation modal */}
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
                            <button className="btn btn-amber" onClick={() => confirmSelect(cloudConfirm)} id="btn-confirm-cloud">
                                Yes, Use Cloud Drive
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
