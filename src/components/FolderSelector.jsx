import React from 'react'
import { useAppStore } from '../store/appStore'

const FOLDER_ICONS = {
    Desktop: '🖥️', Documents: '📄', Downloads: '⬇️',
    Pictures: '🖼️', Music: '🎵', Videos: '🎬', OneDrive: '☁️',
}

function CheckRow({ folder, checked, onToggle }) {
    const icon = FOLDER_ICONS[folder.name] || '📁'
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
        }
    }
    return (
        <div
            className={`checkbox-row ${checked ? 'checked' : ''}`}
            onClick={onToggle}
            onKeyDown={handleKeyDown}
            role="checkbox"
            aria-checked={checked}
            tabIndex={0}
            id={`folder-${folder.name.replace(/\s/g, '-').toLowerCase()}`}
            aria-label={`${folder.name} — ${folder.fullPath}`}
        >
            <div className="custom-checkbox" aria-hidden="true">
                <svg viewBox="0 0 12 10" fill="none">
                    <polyline points="1,5 4.5,8.5 11,1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </div>
            <span style={{ fontSize: 16 }} aria-hidden="true">{icon}</span>
            <span className="checkbox-label">{folder.name}</span>
            <div className="flex flex-col">
                <span className="checkbox-sub mono" aria-hidden="true">{folder.fullPath}</span>
                {folder.drivePath && <span className="drive-tag" style={{ fontSize: '9px', opacity: 0.6 }}>Drive: {folder.drivePath}</span>}
            </div>
        </div>
    )
}

export default function FolderSelector() {
    const {
        topLevelFolders, selectedFolders, toggleFolder,
        selectAllFolders, clearFolders, setStep,
    } = useAppStore()

    const allSelected = topLevelFolders.length > 0 && selectedFolders.length === topLevelFolders.length
    const isChecked = (f) => !!selectedFolders.find(s => s.fullPath === f.fullPath)

    const userFolders = topLevelFolders.filter(f => f.isUserFolder)
    const otherFolders = topLevelFolders.filter(f => !f.isUserFolder)

    return (
        <div>
            <div className="section-header">
                <div className="sub">Step 2 of 6</div>
                <h2>Select Source Folders</h2>
                <p>Choose which folders to include in the organization run. Only user-accessible folders are shown.</p>
            </div>

            <div className="flex gap-3 mb-6 flex-between">
                <div className="flex gap-2">
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={selectAllFolders}
                        id="btn-select-all-folders"
                        aria-label={`Select all ${topLevelFolders.length} folders`}
                    >
                        Select All
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={clearFolders}
                        id="btn-clear-folders"
                        aria-label="Clear all selected folders"
                    >
                        Clear
                    </button>
                </div>
                <span className="info-tag" aria-live="polite" aria-atomic="true">
                    {selectedFolders.length} of {topLevelFolders.length} selected
                </span>
            </div>

            {userFolders.length > 0 && (
                <>
                    <p className="text-muted mb-4" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                        User Folders
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                        {userFolders.map(f => (
                            <CheckRow key={f.fullPath} folder={f} checked={isChecked(f)} onToggle={() => toggleFolder(f)} />
                        ))}
                    </div>
                </>
            )}

            {otherFolders.length > 0 && (
                <>
                    <p className="text-muted mb-4" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                        Other Folders
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                        {otherFolders.map(f => (
                            <CheckRow key={f.fullPath} folder={f} checked={isChecked(f)} onToggle={() => toggleFolder(f)} />
                        ))}
                    </div>
                </>
            )}

            {topLevelFolders.length === 0 && (
                <div className="empty-state">
                    <div className="empty-icon">📂</div>
                    <p>No accessible folders found on this drive.</p>
                </div>
            )}

            <div className="flex gap-3 flex-end mt-6">
                <button className="btn btn-ghost" onClick={() => setStep('drive')} id="btn-back-to-drive">← Back</button>
                <button
                    className="btn btn-primary btn-lg"
                    disabled={selectedFolders.length === 0}
                    onClick={() => setStep('mapping')}
                    id="btn-continue-to-mapping"
                >
                    Configure Destinations →
                </button>
            </div>
        </div>
    )
}
