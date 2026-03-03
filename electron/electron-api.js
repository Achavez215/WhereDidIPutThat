/**
 * electron-api.js
 * Safe wrapper to get the Electron API regardless of context.
 *
 * WHY: When electron binary runs main.js, `require('electron')` may
 * resolve to node_modules/electron/index.js (the npm helper that
 * exports just the binary path string) instead of Electron's built-in
 * module. This shim detects that and uses process.electronBinding
 * or falls back gracefully for test/non-electron environments.
 */

'use strict'

let api = null

try {
    // Try the built-in module first via the native binding name
    // In Electron's main process, this is always available
    api = process.binding('electron') // legacy path
} catch (_) {
    // Not available via binding — use require which may or may not work
}

if (!api) {
    try {
        const mod = require('electron')
        if (typeof mod === 'object' && mod !== null && typeof mod.app !== 'undefined') {
            api = mod
        }
    } catch (_) { }
}

if (!api) {
    // Last resort: use the builtin module loader bypass
    // In newer Electron, the native module is registered as 'electron'
    // but node_modules shadows it. We can bypass by deleting the cache entry.
    try {
        const electronPath = require.resolve('electron')
        delete require.cache[electronPath]
        // After clearing cache, if Electron binary is running, the built-in kicks in
        const mod = require('electron')
        if (typeof mod === 'object' && mod !== null && typeof mod.app !== 'undefined') {
            api = mod
        }
    } catch (_) { }
}

if (!api || typeof api === 'string') {
    // We're not in an Electron context at all
    // Return a stub so the app can fail gracefully
    console.error('[WhereDidIPutThat] FATAL: Cannot load Electron API.')
    console.error('[WhereDidIPutThat] Launch with: npx electron . or via npm run dev')
    process.exit(1)
}

module.exports = api
