# WhereDidIPutThat

> Safe, offline file organizer — Electron desktop app with phased execution, backup/rollback, and multi-user support.

![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Active%20Development-orange)

## Overview

**WhereDidIPutThat** is a standalone desktop application that helps you organize messy files across your drives. It runs entirely offline, never touches system directories, and creates mandatory backups before moving anything.

### Key Features

- **Phased Execution Engine** — 6-step workflow: Scan → Preview → Backup → Execute → Validate → Report
- **Safety Guardrails** — System directories (Windows, Program Files, /System, /Library) are hard-blocked
- **Backup & Rollback** — Every operation is reversible with timestamped backups
- **Checkpoint Recovery** — Survives crashes; resumes from the exact file where it stopped
- **Multi-User** — Per-user settings stored in OS-standard locations (`%APPDATA%`, `~/Library/Application Support`)
- **Offline-First** — No internet required for core features
- **Auto-Updates** — Built-in update checker for new releases

## Tech Stack

| Layer | Technology |
|-------|-----------|
| App Shell | Electron |
| Frontend | React + Vite |
| State | Zustand |
| Styling | Vanilla CSS (Dark Command-Center Theme) |
| Backend | Node.js (Main Process) |
| Packaging | electron-builder |
| Database | better-sqlite3 (SQLite WAL) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm v9+
- - [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (auto-installed via npm)

### Installation

```bash
git clone https://github.com/Achavez215/WhereDidIPutThat.git
cd WhereDidIPutThat
npm install
```

### Development

```bash
npm run dev
```

This starts both the Vite dev server and the Electron window concurrently.

### Package for Distribution

```bash
npm run package
```

Outputs:

- **Windows**: `.exe` installer (NSIS) in `dist-electron/`
- **macOS**: `.dmg` in `dist-electron/`

## Project Structure

```
WhereDidIPutThat/
├── electron/
│   ├── main.js              # Electron main process
│   ├── preload.js            # Secure IPC bridge
│   └── core/
│       ├── auditLogger.js    # Action logging & export
│       ├── backupManager.js  # Backup creation & rollback
│       ├── checkpointLogger.js # Crash recovery
│       ├── driveScanner.js   # Drive enumeration
│       ├── fileScanner.js    # File indexing
│       ├── pathManager.js    # Cross-platform paths
│       ├── performanceController.js # Throttling
│       ├── phaseEngine.js    # 6-phase workflow
│       ├── safetyGuard.js    # System protection
│       └── settingsManager.js # User preferences
├── src/
│   ├── App.jsx               # Main app layout
│   ├── index.css             # Design system
│   ├── main.jsx              # React entry
│   ├── store/appStore.js     # Zustand state
│   └── components/
│       ├── DriveSelector.jsx
│       ├── FolderSelector.jsx
│       ├── DestinationMapper.jsx
│       ├── PhasePanel.jsx
│       ├── ReportScreen.jsx
│       ├── PermissionGate.jsx
│       ├── SettingsScreen.jsx
│       └── HelpScreen.jsx
├── build/                    # App icons (.ico, .icns, .png)
├── public/                   # Static assets
├── package.json
└── vite.config.js
```

## Safety Architecture

```
┌─────────────────────────────────────────┐
│           Renderer (React UI)           │
│      No filesystem access allowed       │
├─────────────────────────────────────────┤
│          Preload (IPC Bridge)           │
│    Whitelisted methods only exposed     │
├─────────────────────────────────────────┤
│         Main Process (Node.js)          │
│  safetyGuard ← validates every action   │
│  auditLogger ← logs every operation     │
│  backupManager ← reversible moves      │
└─────────────────────────────────────────┘
```

## License

MIT
