/**
 * tests/safetyGuard.test.js
 * Unit tests for electron/core/safetyGuard.js
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const safetyGuard = require(path.join(__dirname, '../electron/core/safetyGuard'))

describe('safetyGuard', () => {
    describe('isProtected()', () => {
        it('flags Windows system directory as protected', () => {
            expect(safetyGuard.isProtected('C:\\Windows\\System32')).toBe(true)
        })

        it('flags Program Files as protected', () => {
            expect(safetyGuard.isProtected('C:\\Program Files\\SomeApp')).toBe(true)
        })

        it('does NOT flag a normal user documents folder', () => {
            expect(safetyGuard.isProtected('C:\\Users\\omg\\Documents\\Photos')).toBe(false)
        })

        it('does NOT flag a custom download folder', () => {
            expect(safetyGuard.isProtected('D:\\MyDownloads\\vacation')).toBe(false)
        })
    })

    describe('isProtectedExtension()', () => {
        it('flags .exe as protected', () => {
            expect(safetyGuard.isProtectedExtension('setup.exe')).toBe(true)
        })

        it('flags .dll as protected', () => {
            expect(safetyGuard.isProtectedExtension('kernel32.dll')).toBe(true)
        })

        it('does NOT flag .jpg as protected', () => {
            expect(safetyGuard.isProtectedExtension('photo.jpg')).toBe(false)
        })

        it('does NOT flag .docx as protected', () => {
            expect(safetyGuard.isProtectedExtension('report.docx')).toBe(false)
        })

        it('does NOT flag .mp4 as protected', () => {
            expect(safetyGuard.isProtectedExtension('video.mp4')).toBe(false)
        })
    })

    describe('validateTarget()', () => {
        it('rejects a system path as destination', () => {
            const result = safetyGuard.validateTarget('D:\\MyDocs\\file.txt', 'C:\\Windows')
            expect(result.ok).toBe(false)
        })

        it('accepts a valid destination', () => {
            const result = safetyGuard.validateTarget('D:\\Source\\file.txt', 'D:\\Organized\\Documents')
            expect(result.ok).toBe(true)
        })

        it('returns ok:true when src file is inside the destination folder', () => {
            // safetyGuard.validateTarget checks if the TARGET is a protected system path,
            // not whether src and dst overlap — that's the phase engine's concern
            const result = safetyGuard.validateTarget('D:\\Folder\\file.txt', 'D:\\Folder')
            // The destination 'D:\\Folder' is not a system path so it should be ok
            expect(result.ok).toBe(true)
        })
    })
})
