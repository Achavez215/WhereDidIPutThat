import { useState } from 'react'
import { useAppStore } from '../store/appStore'

const CATEGORY_ICONS = {
    images: '🖼️',
    videos: '🎬',
    audio: '🎵',
    pdfs: '📄',
    word_docs: '📝',
    documents: '📁',
    archives: '📦',
    applications: '⚙️',
    other: '📄'
}

function TreeNode({ node, depth = 0 }) {
    const { excludedPaths, togglePathExclusion } = useAppStore()
    const [expanded, setExpanded] = useState(depth < 1)
    const hasChildren = node.children && node.children.length > 0
    const isFolder = node.type === 'folder'

    const isExcluded = excludedPaths.has(node.path)

    const toggleExpand = (e) => {
        e.stopPropagation()
        setExpanded(!expanded)
    }

    const handleToggle = (e) => {
        e.stopPropagation()
        togglePathExclusion(node.path)
    }

    if (!isFolder) return null // We only show folders in the tree view for now, or maybe files too?
    // The requirement says "Expandable tree views", "Categorize content by file type", "Count and classify items"

    const stats = node.stats || {}
    const totalItems = Object.values(stats).reduce((a, b) => a + b, 0)
    const totalSize = node.totalSize || 0
    const formatSize = (bytes) => {
        if (!bytes) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
    }

    return (
        <div className={`tree-node ${isExcluded ? 'excluded' : ''}`} style={{ marginLeft: depth * 16 }}>
            <div className={`tree-row ${expanded ? 'expanded' : ''}`} onClick={toggleExpand}>
                <div
                    className={`tree-checkbox ${isExcluded ? '' : 'checked'}`}
                    onClick={handleToggle}
                >
                    {!isExcluded && '✓'}
                </div>
                <span className="tree-toggle" style={{ fontSize: '10px', minWidth: '60px' }}>
                    {hasChildren ? (expanded ? '▼ Collapse' : '▶ Expand') : '• Item'}
                </span>
                <span className="tree-icon">{isFolder ? '📁' : '📄'}</span>
                <span className="tree-name">{node.name}</span>
                <div className="tree-stats">
                    <span className="tree-size-tag">{formatSize(totalSize)}</span>
                    {Object.entries(stats).map(([cat, count]) => count > 0 && (
                        <span key={cat} className="tree-stat-tag" title={cat}>
                            {CATEGORY_ICONS[cat]} {count}
                        </span>
                    ))}
                    <span className="tree-total-tag">{totalItems} items</span>
                </div>
            </div>
            {expanded && hasChildren && (
                <div className="tree-children">
                    {node.children.map((child, i) => (
                        <TreeNode key={i} node={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    )
}

export default function ScanOverview() {
    const { scanTree } = useAppStore()

    if (!scanTree || !scanTree.children) {
        return (
            <div className="empty-state">
                <p>No scan data available. Please run Phase 1 first.</p>
            </div>
        )
    }

    return (
        <div className="scan-overview card">
            <div className="card-header">
                <h3>Hierarchical Folder Structure</h3>
                <p>Explore your folders and see what's inside before reorganization.</p>
            </div>
            <div className="tree-container">
                {scanTree.children.map((node, i) => (
                    <TreeNode key={i} node={node} />
                ))}
            </div>
        </div>
    )
}
