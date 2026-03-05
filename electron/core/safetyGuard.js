/**
 * safetyGuard.js
 * The central protection layer. Every single file/folder operation
 * in the system must pass through this module before proceeding.
 */

const path = require('path')

// ──────────────────────────────────────────────
// Hard-coded protected paths (Windows)
// ──────────────────────────────────────────────
// Windows constants
const WIN_PROTECTED_ROOTS = [
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\ProgramData',
    'C:\\System Volume Information',
    'C:\\Recovery',
    'C:\\$Recycle.Bin',
    'C:\\Boot',
    'C:\\EFI',
]

// macOS constants
const MAC_PROTECTED_ROOTS = [
    '/System',
    '/Library',
    '/usr',
    '/bin',
    '/sbin',
    '/private',
    '/etc',
    '/var',
]

// Dynamically added from environment (Windows)
const winEnvProtected = process.platform === 'win32' ? [
    process.env.WINDIR,
    process.env.SystemRoot,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramData,
].filter(Boolean) : []

const ALL_PROTECTED = [...new Set([
    ...(process.platform === 'win32' ? WIN_PROTECTED_ROOTS : MAC_PROTECTED_ROOTS),
    ...winEnvProtected
])].map(p => normalize(p))

// Protected folder NAMES (matched at any depth)
const PROTECTED_NAMES = new Set([
    'windows',
    'system32',
    'syswow64',
    'program files',
    'program files (x86)',
    'programdata',
    'appdata',
    'application support',
    'library',
    '$recycle.bin',
    'system volume information',
    'recovery',
    'boot',
])

// Extensions that must never be moved
const PROTECTED_EXTENSIONS = new Set([
    '.exe', '.dll', '.sys', '.drv', '.ocx',
    '.msi', '.msp', '.cab', '.bat', '.cmd',
    '.ps1', '.vbs', '.scr', '.cpl', '.inf',
    '.lnk', // shortcuts could point to critical locations
])

function normalize(p) {
    let norm = p || ''
    // Strip Windows extended-length path prefix for consistent comparison
    if (norm.startsWith('\\\\?\\')) {
        norm = norm.substring(4)
        // Handle \\?\UNC\ prefix
        if (norm.toLowerCase().startsWith('unc\\')) {
            norm = '\\\\' + norm.substring(4)
        }
    }
    return path.normalize(norm).toLowerCase().replace(/\\/g, '/')
}

/**
 * isProtected(targetPath) → boolean
 * Returns true if targetPath is at or inside any protected directory,
 * or if the folder name itself is in the protected names list.
 */
function isProtected(targetPath) {
    if (!targetPath) return true
    const norm = normalize(targetPath)

    // Check against known protected roots
    for (const root of ALL_PROTECTED) {
        if (norm === root || norm.startsWith(root + '/')) return true
    }

    // Check folder name components
    const parts = norm.split('/')
    for (const part of parts) {
        if (PROTECTED_NAMES.has(part.toLowerCase())) return true
    }

    return false
}

/**
 * isProtectedExtension(filePath) → boolean
 * Returns true if the file has a system-critical extension.
 */
function isProtectedExtension(filePath) {
    const ext = path.extname(filePath || '').toLowerCase()
    return PROTECTED_EXTENSIONS.has(ext)
}

/**
 * validateTarget(srcPath, dstPath) → { ok, reason }
 * Validates a proposed move operation. Returns ok:false with a reason
 * if any safety rule is violated.
 */
function validateTarget(srcPath, dstPath) {
    if (!srcPath || !dstPath) {
        return { ok: false, reason: 'Source or destination path is missing.' }
    }
    if (isProtected(srcPath)) {
        return { ok: false, reason: `Source path is in a protected directory: ${srcPath}` }
    }
    if (isProtected(dstPath)) {
        return { ok: false, reason: `Destination path is in a protected directory: ${dstPath}` }
    }
    if (isProtectedExtension(srcPath)) {
        return { ok: false, reason: `File type is protected and cannot be moved: ${path.extname(srcPath)}` }
    }
    // Prevent moving a folder into its own subfolder
    const normSrc = normalize(srcPath)
    const normDst = normalize(dstPath)
    if (normDst.startsWith(normSrc + '/')) {
        return { ok: false, reason: 'Destination cannot be inside the source folder.' }
    }
    return { ok: true, reason: null }
}

module.exports = { isProtected, isProtectedExtension, validateTarget, PROTECTED_EXTENSIONS }
