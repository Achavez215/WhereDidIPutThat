const path = require('path')
const os = require('os')

// 1. Mock Electron BEFORE any other requires
const Module = require('module')
const originalRequire = Module.prototype.require
Module.prototype.require = function () {
    if (arguments[0] === 'electron') {
        return {
            app: {
                getPath: (key) => path.join(os.tmpdir(), 'wdipt_mock_' + key)
            }
        }
    }
    return originalRequire.apply(this, arguments)
}

const fs = require('fs')
const pathManager = require('../electron/core/pathManager')
const fileScanner = require('../electron/core/fileScanner')
const backupManager = require('../electron/core/backupManager')

async function runTests() {
    console.log('--- Starting Hardening Stress Tests ---')

    const baseDir = path.join(os.homedir(), 'WDIPT_StressTest')
    if (fs.existsSync(baseDir)) {
        try {
            fs.rmSync(baseDir, { recursive: true, force: true })
        } catch (e) {
            console.warn('Could not clean up baseDir, attempting to continue...')
        }
    }
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir)

    // 1. Long Path Test
    console.log('\n[1] Testing Long Paths (>260 chars)...')
    let deepDir = baseDir
    for (let i = 0; i < 30; i++) {
        deepDir = path.join(deepDir, 'very_long_folder_name_' + i)
    }
    const longDirPath = pathManager.toLongPath(deepDir)
    fs.mkdirSync(longDirPath, { recursive: true })
    const testFile = path.join(deepDir, 'test_file.txt')
    fs.writeFileSync(pathManager.toLongPath(testFile), 'Hello Long Path')
    console.log('✓ Created path with length:', testFile.length)

    // 2. Async Scanner Test
    console.log('\n[2] Testing Async Scanner...')
    const result = await fileScanner.scanFolders([baseDir], (p) => {
        if (p.type === 'count') process.stdout.write('.')
    })
    console.log('\n✓ Scanned files:', result.manifest.length)
    const found = result.manifest.some(f => f.srcPath.includes('test_file.txt'))
    console.log('✓ Found test file in manifest:', found)

    // 3. Backup & Disk Space Test
    console.log('\n[3] Testing Backup with Long Paths...')
    const backupResult = await backupManager.createBackup(result.manifest, baseDir, (p) => { })
    if (backupResult.ok) {
        console.log('✓ Backup created at:', backupResult.backupPath)
    } else {
        console.log('✗ Backup failed:', backupResult.error)
    }

    // Cleanup
    // fs.rmSync(baseDir, { recursive: true, force: true })
    console.log('\n--- Stress Tests Complete ---')
}

// Mock electron app for pathManager
const { app } = require('electron') || { app: { getPath: (k) => path.join(os.tmpdir(), 'wdipt_mock_' + k) } }

runTests().catch(err => {
    console.error('Test failed:', err)
    process.exit(1)
})
