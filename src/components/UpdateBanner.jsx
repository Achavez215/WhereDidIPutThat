import { useEffect, useState } from 'react'

/**
 * UpdateBanner
 * Listens to the update:available and update:downloaded IPC events
 * and shows a dismissible toast banner at the top of the app.
 */
export default function UpdateBanner() {
    const [state, setState] = useState(null) // null | 'available' | 'ready'

    useEffect(() => {
        if (!window.api) return

        window.api.onUpdateAvailable(() => setState('available'))
        window.api.onUpdateDownloaded(() => setState('ready'))

        return () => {
            window.api.removePhaseListeners?.()
        }
    }, [])

    if (!state) return null

    return (
        <div className="update-banner" role="status" aria-live="polite">
            <span className="update-banner__icon">
                {state === 'ready' ? '✅' : '🔔'}
            </span>
            <span className="update-banner__text">
                {state === 'ready'
                    ? 'Update downloaded and ready to install.'
                    : 'A new update is available and downloading…'}
            </span>
            {state === 'ready' && (
                <button
                    className="update-banner__btn"
                    onClick={() => window.api.checkForUpdates()}
                    title="Restart and install update"
                >
                    Restart &amp; Install
                </button>
            )}
            <button
                className="update-banner__close"
                onClick={() => setState(null)}
                aria-label="Dismiss update notification"
            >
                ✕
            </button>
        </div>
    )
}
