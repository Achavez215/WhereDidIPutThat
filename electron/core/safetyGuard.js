const path = require('path')
const { app } = require('electron')

// Hard-coded protected paths (Windows)
const WIN_PROTECTED_ROOTS = [
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\ProgramData',
    'C:\\System Volume Information',
    'C:\\Recovery',
    'C:\\$Recycle.Bin',
    'C:\\Boot',
    'C:\\EFI'
]

// macOS protected paths
const MAC_PROTECTED_ROOTS = [
    '/System',
    '/Library',
    '/usr',
    '/bin',
    '/sbin',
    '/private',
    '/etc',
    '/var'
]

// Extensions that must never be moved
const PROTECTED_EXTENSIONS = new Set([
    '.exe', '.dll', '.sys', '.drv', '.ocx', '.msi', '.msp', '.cab',
    '.bat', '.cmd', '.ps1', '.vbs', '.scr', '.cpl', '.inf', '.lnk'
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
    // Standardize to forward slashes and remove trailing slash UNLESS it's a root (e.g. C:/)
    let processed = path.normalize(norm).replace(/\\/g, '/')
    if (processed.length > 3 && processed.endsWith('/')) {
        processed = processed.slice(0, -1)
    }
    return processed.toLowerCase()
}

let ALL_PROTECTED = null

/**
 * getProtectedRoots() -> string[]
 * Dynamically fetches system-critical paths from Electron.
 * Cached after the first call.
 */
function getProtectedRoots() {
    if (ALL_PROTECTED) return ALL_PROTECTED

    // Dynamically grab OS-specific critical user paths via Electron
    const systemPaths = []
    try {
        systemPaths.push(app.getPath('userData'))
        systemPaths.push(app.getPath('appData'))
        // Do NOT block 'home' root entirely, only specific system-critical subpaths if needed.
        // If we block 'home', users can't organize their own Documents/Downloads inside it.
    } catch (e) {
        console.warn('Electron app not ready, system path protection may be limited.')
    }

    const winEnvProtected = process.platform === 'win32' ? [
        process.env.WINDIR,
        process.env.SystemRoot,
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)'],
        process.env.ProgramData,
    ].filter(Boolean) : []

    const hardcoded = process.platform === 'win32' ? WIN_PROTECTED_ROOTS : MAC_PROTECTED_ROOTS

    ALL_PROTECTED = [...new Set([...hardcoded, ...winEnvProtected, ...systemPaths])].map(p => normalize(p))
    return ALL_PROTECTED
}

/**
 * isProtected(targetPath) → boolean
 * Returns true if targetPath is at or inside any protected directory.
 */
function isProtected(targetPath) {
    if (!targetPath) return true
    const norm = normalize(targetPath)
    const roots = getProtectedRoots()

    for (const root of roots) {
        // Strict match: Must be exactly the root, or directly inside the root
        // Ensures 'C:/Windows/System32' is blocked, but 'D:/My Windows Backups' is safe.
        if (norm === root || norm.startsWith(root + '/')) return true
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
 * Validates a proposed move operation.
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
