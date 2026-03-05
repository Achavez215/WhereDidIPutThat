/**
 * tests/auditLogger.test.js
 * Unit tests for electron/core/auditLogger.js
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import fs from 'fs'
import path from 'path'
import os from 'os'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Override pathManager's getLogFile to a test-specific tmp path
const TEST_LOG = path.join(os.tmpdir(), `wdipt_audit_test_${Date.now()}.jsonl`)
const pathManager = require(path.join(__dirname, '../electron/core/pathManager'))
pathManager.getLogFile = () => TEST_LOG

const auditLogger = require(path.join(__dirname, '../electron/core/auditLogger'))

const tmpCsv = path.join(os.tmpdir(), `wdipt_test_export_${Date.now()}.csv`)
const tmpJson = path.join(os.tmpdir(), `wdipt_test_export_${Date.now()}.json`)
const tmpHtml = path.join(os.tmpdir(), `wdipt_test_export_${Date.now()}.html`)

describe('auditLogger', () => {
    beforeEach(() => auditLogger.clearLog())

    afterEach(() => {
        ;[tmpCsv, tmpJson, tmpHtml].forEach(f => {
            try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch { }
        })
    })

    it('starts with an empty log after clear', () => {
        expect(auditLogger.getAll()).toEqual([])
    })

    it('logs a MOVED action', () => {
        auditLogger.log({ action: 'MOVED', srcPath: 'C:\\src\\a.jpg', dstPath: 'C:\\dst\\a.jpg', size: 1024, phase: 4 })
        const entries = auditLogger.getAll()
        expect(entries).toHaveLength(1)
        expect(entries[0].action).toBe('MOVED')
        expect(entries[0].srcPath).toBe('C:\\src\\a.jpg')
    })

    it('logs multiple actions', () => {
        auditLogger.log({ action: 'MOVED', srcPath: 'a.jpg', dstPath: 'b.jpg', size: 100 })
        auditLogger.log({ action: 'BLOCKED', srcPath: 'c.exe', reason: 'Protected extension' })
        auditLogger.log({ action: 'ERROR', srcPath: 'd.pdf', error: 'Permission denied' })
        expect(auditLogger.getAll()).toHaveLength(3)
    })

    it('includes a timestamp in each entry', () => {
        auditLogger.log({ action: 'MOVED', srcPath: 'x.png' })
        const [entry] = auditLogger.getAll()
        expect(entry.ts).toBeTruthy()
        expect(new Date(entry.ts).getFullYear()).toBe(new Date().getFullYear())
    })

    it('clearLog() removes all entries', () => {
        auditLogger.log({ action: 'MOVED', srcPath: 'x.png' })
        auditLogger.clearLog()
        expect(auditLogger.getAll()).toEqual([])
    })

    it('exports CSV correctly', () => {
        auditLogger.log({ action: 'MOVED', srcPath: 'a.jpg', dstPath: 'b.jpg', size: 512, phase: 4 })
        const result = auditLogger.exportReport(tmpCsv, 'csv')
        expect(result.ok).toBe(true)
        expect(fs.existsSync(tmpCsv)).toBe(true)
        const content = fs.readFileSync(tmpCsv, 'utf8')
        expect(content).toContain('MOVED')
        expect(content).toContain('a.jpg')
    })

    it('exports JSON correctly', () => {
        auditLogger.log({ action: 'BLOCKED', srcPath: 'bad.exe', reason: 'Protected' })
        const result = auditLogger.exportReport(tmpJson, 'json')
        expect(result.ok).toBe(true)
        const parsed = JSON.parse(fs.readFileSync(tmpJson, 'utf8'))
        expect(parsed).toHaveLength(1)
        expect(parsed[0].action).toBe('BLOCKED')
    })

    it('exports HTML correctly', () => {
        auditLogger.log({ action: 'MOVED', srcPath: 'photo.jpg', dstPath: 'Images/photo.jpg', size: 2048 })
        const result = auditLogger.exportReport(tmpHtml, 'html')
        expect(result.ok).toBe(true)
        const html = fs.readFileSync(tmpHtml, 'utf8')
        expect(html).toContain('<!DOCTYPE html>')
        expect(html).toContain('WhereDidIPutThat')
        expect(html).toContain('MOVED')
    })
})
