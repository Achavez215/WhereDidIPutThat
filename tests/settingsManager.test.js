/**
 * tests/settingsManager.test.js
 * Unit tests for electron/core/settingsManager.js
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import fs from 'fs'
import path from 'path'
import os from 'os'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Use a fresh tmp settings file so tests don't share state
const TEST_SETTINGS_PATH = path.join(os.tmpdir(), `wdipt_settings_test_${Date.now()}.json`)

// Patch pathManager's getSettingsFile
const pathManager = require(path.join(__dirname, '../electron/core/pathManager'))
pathManager.getSettingsFile = () => TEST_SETTINGS_PATH

const settingsManager = require(path.join(__dirname, '../electron/core/settingsManager'))

describe('settingsManager', () => {
    beforeEach(() => {
        // Remove settings file before each test to reset state
        if (fs.existsSync(TEST_SETTINGS_PATH)) fs.unlinkSync(TEST_SETTINGS_PATH)
        // Reset internal cache by calling a reload trick:
        // We can't easily re-require without mocking, so we just delete the file
        // so next call to load() re-creates from defaults.
        // Force _settings reset by calling a save on fresh defaults:
        settingsManager._reset?.() // Guard: only call if exposed
    })

    it('loads default settings on first run', () => {
        // Delete settings cache by removing file
        if (fs.existsSync(TEST_SETTINGS_PATH)) fs.unlinkSync(TEST_SETTINGS_PATH)
        // Re-require fresh instance
        const fresh = (() => {
            const sm = require(path.join(__dirname, '../electron/core/settingsManager'))
            return sm
        })()
        const settings = fresh.getAll()
        expect(settings).toBeTruthy()
        expect(settings.theme).toBe('dark')
        expect(settings.safety).toBeDefined()
        expect(settings.safety.dryRunDefault).toBe(true)
        expect(settings.detectDuplicates).toBe(true)
    })

    it('getAll() returns an object with all fields', () => {
        const settings = settingsManager.getAll()
        expect(settings).toHaveProperty('theme')
        expect(settings).toHaveProperty('safety')
        expect(settings).toHaveProperty('fileSizeFilter')
        expect(settings).toHaveProperty('detectDuplicates')
        expect(settings).toHaveProperty('retention')
    })

    it('fileSizeFilter defaults to 0/0 (no filter)', () => {
        const settings = settingsManager.getAll()
        expect(settings.fileSizeFilter.minBytes).toBe(0)
        expect(settings.fileSizeFilter.maxBytes).toBe(0)
    })

    it('retention defaults are correct', () => {
        const settings = settingsManager.getAll()
        expect(settings.retention.autoDeleteBackups).toBe(false)
        expect(settings.retention.daysToKeep).toBe(7)
    })

    it('update() merges partial settings without clobbering others', () => {
        const updated = settingsManager.update({ theme: 'light', detectDuplicates: false })
        expect(updated.theme).toBe('light')
        expect(updated.detectDuplicates).toBe(false)
        // Existing sub-objects not clobbered
        expect(updated.retention).toBeDefined()
    })
})
