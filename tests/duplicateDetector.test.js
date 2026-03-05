/**
 * tests/duplicateDetector.test.js
 * Unit tests for electron/core/duplicateDetector.js
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import fs from 'fs'
import path from 'path'
import os from 'os'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { findDuplicates } = require(path.join(__dirname, '../electron/core/duplicateDetector'))

// Helper: write a temp file with given content, return path
function tmpFile(name, content = 'hello world') {
    const p = path.join(os.tmpdir(), `wdipt_dup_test_${name}`)
    fs.writeFileSync(p, content)
    return p
}

describe('duplicateDetector', () => {
    it('returns empty groups when manifest is empty', async () => {
        const result = await findDuplicates([])
        expect(result.groups).toEqual([])
        expect(result.totalDuplicates).toBe(0)
        expect(result.wastedBytes).toBe(0)
    })

    it('returns no duplicates for unique files', async () => {
        const a = tmpFile('unique_a.txt', 'content-alpha')
        const b = tmpFile('unique_b.txt', 'content-beta')
        const c = tmpFile('unique_c.txt', 'content-gamma')
        try {
            const result = await findDuplicates([
                { srcPath: a, size: 13 },
                { srcPath: b, size: 12 },
                { srcPath: c, size: 13 },
            ])
            expect(result.groups).toEqual([])
            expect(result.totalDuplicates).toBe(0)
        } finally {
            ;[a, b, c].forEach(f => fs.existsSync(f) && fs.unlinkSync(f))
        }
    })

    it('detects a duplicate pair', async () => {
        const content = 'duplicate content xyz'
        const a = tmpFile('dup_a.txt', content)
        const b = tmpFile('unique_x.txt', 'something else')
        const c = tmpFile('dup_b.txt', content) // same as a
        try {
            const result = await findDuplicates([
                { srcPath: a, size: content.length },
                { srcPath: b, size: 14 },
                { srcPath: c, size: content.length },
            ])
            expect(result.groups).toHaveLength(1)
            expect(result.groups[0].files).toHaveLength(2)
            expect(result.totalDuplicates).toBe(1)
            expect(result.wastedBytes).toBe(content.length)
        } finally {
            ;[a, b, c].forEach(f => fs.existsSync(f) && fs.unlinkSync(f))
        }
    })

    it('detects multiple duplicate groups', async () => {
        const c1 = 'group one content'
        const c2 = 'group two content'
        const a1 = tmpFile('g1_a.txt', c1)
        const a2 = tmpFile('g1_b.txt', c1)
        const b1 = tmpFile('g2_a.txt', c2)
        const b2 = tmpFile('g2_b.txt', c2)
        const unique = tmpFile('solo.txt', 'i am unique')
        try {
            const result = await findDuplicates([
                { srcPath: a1, size: c1.length },
                { srcPath: a2, size: c1.length },
                { srcPath: b1, size: c2.length },
                { srcPath: b2, size: c2.length },
                { srcPath: unique, size: 11 },
            ])
            expect(result.groups).toHaveLength(2)
            expect(result.totalDuplicates).toBe(2)
            expect(result.wastedBytes).toBe(c1.length + c2.length)
        } finally {
            ;[a1, a2, b1, b2, unique].forEach(f => fs.existsSync(f) && fs.unlinkSync(f))
        }
    })

    it('calls onProgress callback', async () => {
        const a = tmpFile('prog_a.txt', 'test')
        try {
            const calls = []
            await findDuplicates(
                [{ srcPath: a, size: 4 }],
                (checked, total) => calls.push({ checked, total })
            )
            expect(calls.length).toBeGreaterThan(0)
            // Last call should be checked === total
            const last = calls[calls.length - 1]
            expect(last.checked).toBe(last.total)
        } finally {
            fs.existsSync(a) && fs.unlinkSync(a)
        }
    })
})
