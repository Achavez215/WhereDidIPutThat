const path = require('path')
const os = require('os')

// 1. Mock Electron
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
const phaseEngine = require('../electron/core/phaseEngine')
const dbManager = require('../electron/core/dbManager')

async function runTests() {
    console.log('--- Starting Enterprise-Grade Stress Tests ---')

    const baseDir = path.join(os.homedir(), 'WDIPT_EnterpriseStress')
    if (fs.existsSync(baseDir)) {
        try {
            fs.rmSync(baseDir, { recursive: true, force: true })
        } catch (e) { }
    }
    fs.mkdirSync(baseDir)

    // 1. Database & Streaming Scan Test
    console.log('\n[1] Testing SQLite Database & Streaming Scan...')
    const testFiles = 1000
    const srcDir = path.join(baseDir, 'source')
    fs.mkdirSync(srcDir)
    for (let i = 0; i < testFiles; i++) {
        fs.writeFileSync(path.join(srcDir, `file_${i}.txt`), `Content ${i}`)
    }

    const scanResult = await fileScanner.scanFolders([srcDir], (p) => {
        if (p.type === 'count' && p.scanned % 500 === 0) process.stdout.write('.')
    })

    const stats = dbManager.getTotalStats()
    console.log('\n✓ Scanned entries in DB:', stats.total)
    console.log('✓ Memory manifest returned (should be undefined):', scanResult.manifest === undefined)

    // 2. Collision Handling & Atomic Move Test
    console.log('\n[2] Testing Collision Handling & Atomic Move...')
    const dstDir = path.join(baseDir, 'destination')
    fs.mkdirSync(dstDir)

    // Create two files with same name in different source folders
    const src1 = path.join(baseDir, 'src1')
    const src2 = path.join(baseDir, 'src2')
    fs.mkdirSync(src1); fs.mkdirSync(src2)
    fs.writeFileSync(path.join(src1, 'conflict.jpg'), 'Content 1')
    fs.writeFileSync(path.join(src2, 'conflict.jpg'), 'Content 2')

    const plannedMoves = [
        { srcPath: path.join(src1, 'conflict.jpg'), dstPath: path.join(dstDir, 'conflict.jpg'), size: 9 },
        { srcPath: path.join(src2, 'conflict.jpg'), dstPath: path.join(dstDir, 'conflict.jpg'), size: 9 }
    ]

    let collisionReported = false
    const moveResult = await phaseEngine.startPhase(4, { plannedMoves }, (p) => {
        if (p.status === 'running') {
            process.stdout.write('>')
            if (p.collision) {
                collisionReported = true
                console.log(`\n  [Progress Event] Collision detected for ${p.lastMove.src}`)
                console.log(`  [Progress Event] Redirection: ${p.collision.originalDst} -> ${p.collision.actualDst}`)
            }
        }
    })

    const dstFiles = fs.readdirSync(dstDir)
    console.log('\n✓ Destination files after collision:', dstFiles)
    console.log('✓ collision handling (conflict_1.jpg exists):', dstFiles.includes('conflict_1.jpg'))
    console.log('✓ collision data reported via progress event:', collisionReported)

    // 3. Paginated DB Retrieval
    console.log('\n[3] Testing Paginated Retrieval...')
    const page1 = dbManager.getFilesByCategory('documents', 5, 0)
    console.log('✓ Page 1 items:', page1.length)
    console.log('✓ First item name:', page1[0]?.name)

    console.log('\n--- Enterprise Stress Tests Complete ---')
    dbManager.clearDb()
}

runTests().catch(err => {
    console.error('Test failed:', err)
    if (typeof Deno !== "undefined") { Deno.exit(1); } else if (typeof process !== "undefined") { process.exit(1); }
})
