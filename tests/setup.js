/**
 * tests/setup.js
 * Mocks modules that require a running Electron process.
 * Uses vi.mock with a factory so the mock stays registered
 * even after vi.resetModules() calls in individual tests.
 */
import { vi } from 'vitest'
import os from 'os'
import path from 'path'

const TEST_USER_DATA = path.join(os.tmpdir(), 'wdipt-test')

// Mock 'electron' app — used by pathManager
vi.mock('electron', () => ({
    app: {
        getPath: (key) => {
            const map = {
                userData: TEST_USER_DATA,
                home: os.homedir(),
            }
            return map[key] || os.tmpdir()
        },
        getVersion: () => '1.0.0-test',
    },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    ipcRenderer: { invoke: vi.fn(), on: vi.fn(), send: vi.fn() },
    contextBridge: { exposeInMainWorld: vi.fn() },
    BrowserWindow: vi.fn(),
    dialog: { showSaveDialog: vi.fn() },
    session: {
        defaultSession: {
            webRequest: { onHeadersReceived: vi.fn() },
        },
    },
}))
