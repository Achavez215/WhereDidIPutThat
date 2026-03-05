import React, { useState } from 'react'
import { useAppStore } from '../store/appStore'

export default function ActionPlanCard({ recommendation }) {
    const { updateRecommendation, rejectRecommendation } = useAppStore()
    const [isEditing, setIsEditing] = useState(false)
    const [dst, setDst] = useState(recommendation.suggestedDst)

    const handleSave = async () => {
        updateRecommendation(recommendation.fileId, dst)
        setIsEditing(false)
    }

    const handleBrowse = async () => {
        const path = await window.api.browseFolder()
        if (path) setDst(path)
    }

    return (
        <div className={`action-card ${recommendation.isDuplicate ? 'duplicate-risk' : ''}`}>
            <div className="action-main">
                <div className="action-file">
                    <span className="file-name">{recommendation.fileName}</span>
                    <span className="file-path">{recommendation.srcPath}</span>
                </div>
                <div className="action-arrow">→</div>
                <div className="action-dst">
                    {isEditing ? (
                        <div className="flex gap-2 w-full">
                            <input
                                type="text"
                                className="dest-input"
                                value={dst}
                                onChange={(e) => setDst(e.target.value)}
                            />
                            <button className="btn btn-sm" onClick={handleBrowse}>📁</button>
                            <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setIsEditing(false)}>✕</button>
                        </div>
                    ) : (
                        <div className="flex flex-between w-full">
                            <span className="dst-path">{recommendation.suggestedDst}</span>
                            <button className="btn btn-ghost btn-xs" onClick={() => setIsEditing(true)}>Edit</button>
                        </div>
                    )}
                </div>
            </div>
            {recommendation.isDuplicate && (
                <div className="action-warning">
                    ⚠️ Potential duplicate detected. Reorganizing might lead to data redundancy.
                </div>
            )}
            <div className="action-footer">
                <button className="btn btn-ghost btn-xs text-red" onClick={() => rejectRecommendation(recommendation.fileId)}>
                    Reject Recommendation
                </button>
            </div>
        </div>
    )
}
