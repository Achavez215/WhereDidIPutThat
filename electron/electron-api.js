/**
 * electron-api.js
 * Safe wrapper to get the Electron API regardless of context.
 *
 * WHY: When electron binary runs main.js, `require('electron')` may
 * resolve to node_modules/electron/index.js (the npm helper that
 * exports just the binary path string) instead of Electron's built-in
 * module. This shim detects that and uses Module._load to bypass shadowing.
 */

'use strict'

const Module = require('module')

function getElectronApi() {
    // 1. Try to load from the built-in loader by bypassing all node_modules paths
    try {
        // By passing a parent with no paths, we force it to check built-ins
        const dummyParent = { paths: [] }
        const mod = Module._load('electron', dummyParent, false)
        if (typeof mod === 'object' && mod !== null && mod.app) return mod
    } catch (e) { }

    // 2. Fallback to standard require (in case shadowing is not an issue)
    try {
        const mod = require('electron')
        if (typeof mod === 'object' && mod !== null && mod.app) return mod
    } catch (e) { }

    // 3. Last resort: internal bindings (older/specific Electron versions)
    try {
        if (typeof process._linkedBinding === 'function') {
            const binding = process._linkedBinding('electron_main_app') ||
                process._linkedBinding('electron_common_features')
            if (binding && binding.app) return binding
        }
    } catch (e) { }

    return null
}

const api = getElectronApi()

if (!api || typeof api === 'string') {
    // If we're here, we are likely running as a plain Node process (ELECTRON_RUN_AS_NODE=1)
    // or the environment is not set up correctly.
    console.error('[WhereDidIPutThat] FATAL: Cannot load Electron API.')
    if (process.env.ELECTRON_RUN_AS_NODE === '1') {
        console.error('[WhereDidIPutThat] ERROR: ELECTRON_RUN_AS_NODE is set to 1. This disables Electron APIs.')
        console.error('[WhereDidIPutThat] FIX: Unset it with: $env:ELECTRON_RUN_AS_NODE = $null')
    }
    if (typeof Deno !== "undefined") { Deno.exit(1); } else if (typeof process !== "undefined") { process.exit(1); }
}

module.exports = api
