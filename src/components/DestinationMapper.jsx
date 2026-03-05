import React, { useState } from 'react'
import { useAppStore } from '../store/appStore'

const CATEGORIES = [
    { key: 'images', label: 'Images', icon: '🖼️', className: 'cat-images', exts: 'jpg, png, gif, heic…' },
    { key: 'videos', label: 'Videos', icon: '🎬', className: 'cat-videos', exts: 'mp4, mkv, mov…' },
    { key: 'audio', label: 'Audio', icon: '🎵', className: 'cat-audio', exts: 'mp3, wav, flac…' },
    { key: 'documents', label: 'Documents', icon: '📄', className: 'cat-documents', exts: 'pdf, docx, xlsx…' },
    { key: 'archives', label: 'Archives', icon: '📦', className: 'cat-archives', exts: 'zip, rar, 7z…' },
    { key: 'other', label: 'Other', icon: '📁', className: 'cat-other', exts: 'all other types' },
]

function getRecommendation(key, selectedDrive) {
    const base = selectedDrive?.mountPath || 'C:\\'
    const map = {
        images: `${base}Pictures\\Organized`,
        videos: `${base}Videos\\Organized`,
        audio: `${base}Music\\Organized`,
        documents: `${base}Documents\\Organized`,
        archives: `${base}Downloads\\Archives`,
        other: `${base}Documents\\Other`,
    }
    return map[key] || ''
}

export default function DestinationMapper() {
    const { stats, destinationMap, setDestination, setStep, selectedDrive } = useAppStore()
    const [mode, setMode] = useState({}) // category key → 'existing' | 'new' | 'recommend'

    const getMode = (key) => mode[key] || 'recommend'

    const activeCategories = CATEGORIES.filter(c => stats ? stats.byCategory[c.key] > 0 : true)

    const allMapped = activeCategories.every(c => {
        const m = getMode(c.key)
        if (m === 'recommend') return true
        return !!destinationMap[c.key]
    })

    const applyRecommendations = () => {
        activeCategories.forEach(c => {
            if (getMode(c.key) === 'recommend' || !destinationMap[c.key]) {
                setDestination(c.key, getRecommendation(c.key, selectedDrive))
                setMode(m => ({ ...m, [c.key]: 'recommend' }))
            }
        })
    }

    const handleBrowse = async (key) => {
        const path = await window.api.browseFolder()
        if (path) setDestination(key, path)
    }

    return (
        <div>
            <div className="section-header">
                <div className="sub">Step 3 of 6</div>
                <h2>Destination Mapping</h2>
                <p>Define where each file category should land. You can accept recommendations, pick existing folders, or type a new path.</p>
            </div>

            {stats && (
                <div className="flex gap-3 mb-6" style={{ flexWrap: 'wrap' }}>
                    {CATEGORIES.map(c => stats.byCategory[c.key] > 0 && (
                        <span key={c.key} className={`cat-chip ${c.className}`}>
                            {c.icon} {c.label}: {stats.byCategory[c.key].toLocaleString()} files
                        </span>
                    ))}
                </div>
            )}

            <div className="flex gap-2 mb-6">
                <button className="btn btn-ghost btn-sm" onClick={applyRecommendations} id="btn-use-all-recommendations">
                    ✨ Use All Recommendations
                </button>
            </div>

            {activeCategories.map(cat => {
                const rec = getRecommendation(cat.key, selectedDrive)
                const currentMode = getMode(cat.key)

                return (
                    <div key={cat.key} className="dest-row">
                        {/* Category label */}
                        <div className="flex gap-3">
                            <span className={`cat-chip ${cat.className}`}>{cat.icon} {cat.label}</span>
                        </div>

                        {/* Destination input */}
                        <div>
                            {currentMode === 'recommend' ? (
                                <div className="recommendation">
                                    <span className="arrow" aria-hidden="true">→</span>
                                    <span className="mono" style={{ fontSize: 11 }}>{rec}</span>
                                    <span className="info-tag" style={{ marginLeft: 8 }}>Recommended</span>
                                </div>
                            ) : currentMode === 'existing' ? (
                                <div className="flex gap-2">
                                    <input
                                        className="dest-input"
                                        placeholder="Paste or browse to existing folder…"
                                        value={destinationMap[cat.key] || ''}
                                        onChange={e => setDestination(cat.key, e.target.value)}
                                        id={`dest-input-${cat.key}`}
                                        aria-label={`Destination path for ${cat.label} files`}
                                    />
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => handleBrowse(cat.key)}
                                        aria-label={`Browse for existing destination folder for ${cat.label}`}
                                    >
                                        Browse
                                    </button>
                                </div>
                            ) : (
                                <input
                                    className="dest-input"
                                    placeholder="Type new folder path (will be created)…"
                                    value={destinationMap[cat.key] || ''}
                                    onChange={e => setDestination(cat.key, e.target.value)}
                                    id={`dest-input-new-${cat.key}`}
                                    aria-label={`New destination folder path for ${cat.label} files`}
                                />
                            )}
                        </div>

                        {/* Mode toggle */}
                        <div className="flex gap-2" role="group" aria-label={`Destination mode for ${cat.label}`}>
                            {['recommend', 'existing', 'new'].map(m => (
                                <button
                                    key={m}
                                    className={`btn btn-sm ${currentMode === m ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => {
                                        setMode(prev => ({ ...prev, [cat.key]: m }))
                                        if (m === 'recommend') setDestination(cat.key, rec)
                                    }}
                                    id={`dest-mode-${cat.key}-${m}`}
                                    aria-label={m === 'recommend' ? `Use recommended path for ${cat.label}` : m === 'existing' ? `Browse existing folder for ${cat.label}` : `Create new folder for ${cat.label}`}
                                    aria-pressed={currentMode === m}
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                    <span aria-hidden="true">{m === 'recommend' ? '✨' : m === 'existing' ? '📂' : '➕'}</span>
                                    <span style={{ fontSize: '10px' }}>{m === 'recommend' ? 'Auto' : m === 'existing' ? 'Browse' : 'New'}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )
            })}

            <div className="flex gap-3 flex-end mt-6">
                <button className="btn btn-ghost" onClick={() => setStep('folders')} id="btn-back-to-folders">← Back</button>
                <button
                    className="btn btn-amber btn-lg"
                    disabled={!allMapped}
                    onClick={() => setStep('phases')}
                    id="btn-start-phases"
                >
                    🚀 Start Phased Execution →
                </button>
            </div>
        </div>
    )
}
