import { useState, useEffect } from 'react';

/**
 * usePaginatedFiles(category)
 * Hook for fetching file recommendations from the SQLite database in chunks.
 */
export function usePaginatedFiles(category = 'all') {
    const [files, setFiles] = useState([]);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 50;

    const loadMore = async () => {
        if (loading || !hasMore) return;
        setLoading(true);

        try {
            const offset = page * LIMIT;
            // page is used as multiplier for offset
            // The IPC handler expects (category, limit, offset)
            const newFiles = await window.api.getFiles(category, LIMIT, offset);

            if (newFiles.length < LIMIT) {
                setHasMore(false);
            }

            setFiles(prev => [...prev, ...newFiles]);
            setPage(p => p + 1);
        } catch (err) {
            console.error("Failed to load files", err);
        } finally {
            setLoading(false);
        }
    };

    // Reset and load first batch when category changes
    useEffect(() => {
        setFiles([]);
        setPage(0);
        setHasMore(true);
        // Using a functional update or a flag to ensure we don't double-trigger if category changes rapidly
        const triggerInitialLoad = async () => {
            setLoading(true);
            try {
                const results = await window.api.getFiles(category, LIMIT, 0);
                if (results.length < LIMIT) setHasMore(false);
                setFiles(results);
                setPage(1);
            } catch (err) {
                console.error("Initial load failed", err);
            } finally {
                setLoading(false);
            }
        };
        triggerInitialLoad();
    }, [category]);

    return { files, loadMore, loading, hasMore };
}
