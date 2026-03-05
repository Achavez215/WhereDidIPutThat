// Deep diagnostic - what is available in Electron main process?
console.log('process.type:', process.type)
console.log('process.versions.electron:', process.versions.electron)
console.log('process.electronBinding:', typeof process.electronBinding)
console.log('process.atomBinding:', typeof process.atomBinding)

// The Electron built-in should be accessible via internal module
// After Electron patches the module system, 'electron' maps to its API
// Let's see if we can find it through Module._resolveFilename
const Module = require('module')
const origResolve = Module._resolveFilename
// Check if there's an override
Module._resolveFilename = function (request, ...args) {
    if (request === 'electron') {
        console.log('electron resolve called!')
    }
    return origResolve.call(this, request, ...args)
}

// Force a fresh require
const electronEntry = require.resolve('electron')
console.log('electron resolved to:', electronEntry)

// Check if there's an internal electron module
try {
    // Electron registers its API under this internal path in some versions
    const internalElectron = process._linkedBinding ? process._linkedBinding('electron_common_features') : null
    console.log('internal electron_common_features:', typeof internalElectron)
} catch (e) {
    console.log('_linkedBinding error:', e.message)
}

if (typeof Deno !== "undefined") { Deno.exit(0); } else if (typeof process !== "undefined") { process.exit(0); }
