const path = require('path')
const os = require('os')

// 1. Mock Electron BEFORE any other requires
const Module = require('module')
const originalRequire = Module.prototype.require
Module.prototype.require = function () {
    if (arguments[0] === 'electron') {
        const mockPaths = {
            userData: path.join(os.tmpdir(), 'wdipt_mock_userData'),
            appData: path.join(os.tmpdir(), 'wdipt_mock_appData'),
            home: os.homedir()
        }
        return {
            app: {
                getPath: (key) => mockPaths[key] || path.join(os.tmpdir(), 'wdipt_mock_' + key)
            }
        }
    }
    return originalRequire.apply(this, arguments)
}

const fs = require('fs')
const pathManager = require('../electron/core/pathManager')
const fileScanner = require('../electron/core/fileScanner')
const backupManager = require('../electron/core/backupManager')
const safetyGuard = require('../electron/core/safetyGuard')

async function runTests() {
    console.log('--- Starting Hyper-Hardening Stress Tests ---')

    const baseDir = path.join(os.homedir(), 'WDIPT_HyperStress')
    if (fs.existsSync(baseDir)) {
        try {
            fs.rmSync(baseDir, { recursive: true, force: true })
        } catch (e) { }
    }
    fs.mkdirSync(baseDir)

    // 1. Long Path & Async Scanner Test
    console.log('\n[1] Testing Long Paths & Async Scanner...')
    let deepDir = baseDir
    for (let i = 0; i < 20; i++) {
        deepDir = path.join(deepDir, 'folder_' + i)
    }
    const longDirPath = pathManager.toLongPath(deepDir)
    fs.mkdirSync(longDirPath, { recursive: true })
    const testFile = path.join(deepDir, 'hyper_test.txt')
    fs.writeFileSync(pathManager.toLongPath(testFile), 'Hyper Hardening Test Content')

    const result = await fileScanner.scanFolders([baseDir], (p) => {
        if (p.type === 'count') process.stdout.write('.')
    })
    console.log('\n✓ Scanned files:', result.manifest.length)
    console.log('✓ Found test file:', result.manifest.some(f => f.srcPath.includes('hyper_test.txt')))

    // 2. Dynamic Safety Test
    console.log('\n[2] Testing Dynamic Safety...')
    const userDataPath = path.join(os.tmpdir(), 'wdipt_mock_userData')
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath)

    console.log('UserData Protected:', safetyGuard.isProtected(userDataPath))
    console.log('Safe Path Allowed (Library):', !safetyGuard.isProtected(path.join(baseDir, 'My Library')))

    // 3. Async Backup Test
    console.log('\n[3] Testing Non-Blocking Async Backup...')
    const backupResult = await backupManager.createBackup(result.manifest, baseDir, (p) => {
        if (p.copied % 1 === 0) process.stdout.write('+')
    })
    if (backupResult.ok) {
        console.log('\n✓ Async Backup created at:', backupResult.backupPath)
    } else {
        console.log('\n✗ Backup failed:', backupResult.error)
    }

    console.log('\n--- Stress Tests Complete ---')
}

runTests().catch(err => {
    console.error('Test failed:', err)
    process.exit(1)
})
