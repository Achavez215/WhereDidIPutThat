import { useState, useEffect } from 'react';

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

    // Reset when category changes
    useEffect(() => {
        setFiles([]);
        setPage(0);
        setHasMore(true);
        loadMore();
    }, [category]);

    return { files, loadMore, loading, hasMore };
}
