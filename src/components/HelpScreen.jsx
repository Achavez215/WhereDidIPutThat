import { useState } from 'react'

const TABS = [
    { id: 'instructions', label: 'Instructions', icon: '📖' },
    { id: 'qa', label: 'Q&A', icon: '❓' },
    { id: 'troubleshooting', label: 'Troubleshooting', icon: '🛠️' },
]

export default function HelpScreen() {
    const [activeTab, setActiveTab] = useState('instructions')

    return (
        <div style={{ maxWidth: '900px' }}>
            <div className="section-header">
                <div className="sub">Knowledge Base</div>
                <h2>Help & Support</h2>
                <p>Everything you need to know about the organization process and safety system.</p>
            </div>

            <div className="flex gap-4 mb-8" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            <div className="help-content">
                {activeTab === 'instructions' && <InstructionsTab />}
                {activeTab === 'qa' && <QATab />}
                {activeTab === 'troubleshooting' && <TroubleshootingTab />}
            </div>
        </div>
    )
}

function InstructionsTab() {
    return (
        <div className="card">
            <h3 className="mb-4">How to Organize Your Files</h3>
            <ol style={{ paddingLeft: '20px', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
                <li><strong>Step 1: Select Drive</strong> — Choose the physical drive where your messy folders live.</li>
                <li><strong>Step 2: Choose Folders</strong> — Pick specific folders to scan. System folders are automatically skipped for safety.</li>
                <li><strong>Step 3: Map Categories</strong> — Tell the app where you want specific file types (Images, Videos, Docs) to go.</li>
                <li><strong>Step 4: Execute in Phases</strong> — Click "Execute" and watch the app analyze, backup, and move your files in small batches.</li>
                <li><strong>Step 5: Review Report</strong> — Once complete, review the audit log to see exactly what happened.</li>
            </ol>
        </div>
    )
}

function QATab() {
    const items = [
        { q: "Is this app safe?", a: "Yes. It uses a phased execution engine with mandatory verification. It never deletes an original until the copy is verified to be identical." },
        { q: "Can it see my passwords?", a: "No. The app only scans file metadata (name, size, type). It does not read inside your files or connect to the internet." },
        { q: "Why can't I select my C:\\Windows folder?", a: "The 'Safe Mode' guardrail prevents the app from touching system directories to avoid breaking your operating system." },
        { q: "What happens if my computer crashes during a move?", a: "The app saves a checkpoint after every batch. When you restart, it will offer to 'Resume' exactly where it left off." }
    ]
    return (
        <div className="grid-2">
            {items.map((item, i) => (
                <div key={i} className="card">
                    <div style={{ color: 'var(--accent-teal)', fontWeight: 700, marginBottom: '8px' }}>Q: {item.q}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{item.a}</div>
                </div>
            ))}
        </div>
    )
}

function TroubleshootingTab() {
    return (
        <div className="card">
            <h3 className="mb-4">Best Practices & Troubleshooting</h3>
            <div className="grid-2" style={{ gap: '32px' }}>
                <div>
                    <h4 className="mb-2" style={{ color: 'var(--accent-green)' }}>Best Practices</h4>
                    <ul style={{ paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                        <li>Always enable backups before a major move.</li>
                        <li>Organize one drive at a time to minimize disk fragmentation.</li>
                        <li>Review the 'Proposed Mapping' carefully before clicking execute.</li>
                    </ul>
                </div>
                <div>
                    <h4 className="mb-2" style={{ color: 'var(--accent-red)' }}>Troubleshooting</h4>
                    <ul style={{ paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                        <li><strong>Access Denied:</strong> Ensure you have write permissions for the destination folder.</li>
                        <li><strong>Slow Performance:</strong> Close background apps like BitTorrent or Antivirus scans.</li>
                        <li><strong>Missing Drive:</strong> Refresh the drive list by clicking 'Drives' tab in the sidebar.</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
