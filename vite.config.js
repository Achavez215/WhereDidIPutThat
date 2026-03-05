import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
    },
    test: {
        environment: 'node',
        globals: true,
        // Mock electron so core modules can be tested without a running Electron process
        setupFiles: ['./tests/setup.js'],
    },
})
