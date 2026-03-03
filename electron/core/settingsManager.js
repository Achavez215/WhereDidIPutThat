/**
 * settingsManager.js
 * Manages user preferences and persistence using an OS-standard config location.
 */

const fs = require('fs')
const pathManager = require('./pathManager')

const DEFAULT_SETTINGS = {
    lastSelectedDrive: null,
    folderMappingPreferences: {},
    safety: {
        dryRunDefault: true,
        protectedDirectoriesList: [], // Additional user-defined ones
        backupBeforeMove: true,
    },
    retention: {
        autoDeleteBackups: false,
        daysToKeep: 7,
    },
    firstRun: true,
}

let _settings = null

function load() {
    if (_settings) return _settings
    const filePath = pathManager.getSettingsFile()
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8')
            _settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
        } else {
            _settings = { ...DEFAULT_SETTINGS }
            save()
        }
    } catch {
        _settings = { ...DEFAULT_SETTINGS }
    }
    return _settings
}

function save() {
    const filePath = pathManager.getSettingsFile()
    try {
        fs.writeFileSync(filePath, JSON.stringify(_settings, null, 2), 'utf8')
    } catch (err) {
        console.error('Failed to save settings:', err)
    }
}

function get(key) {
    load()
    return _settings[key]
}

function set(key, value) {
    load()
    _settings[key] = value
    save()
}

function getAll() {
    return load()
}

function update(newSettings) {
    load()
    _settings = { ..._settings, ...newSettings }
    save()
    return _settings
}

module.exports = { get, set, getAll, update }
