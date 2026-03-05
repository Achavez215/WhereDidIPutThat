# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

WhereDidIPutThat handles local filesystem operations including reading, moving, and backing up user files. Security issues are taken seriously.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Instead, use one of the following:

- **GitHub Private Reporting:** Use the [Report a vulnerability](../../security/advisories/new) button on this repository.
- **Email:** Contact the maintainer directly via GitHub profile.

## What to Include

When reporting, please include:
- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact (e.g. unintended file deletion, path traversal, privilege escalation)
- Your OS and app version

## Response Timeline

- **Acknowledgement:** Within 72 hours
- **Status update:** Within 7 days
- **Patch release:** Within 30 days for critical issues

## Scope

The following are in scope for security reports:
- Path traversal attacks bypassing `safetyGuard.js`
- Unauthorized writes to system directories
- IPC bridge exploitation from the renderer process
- Checkpoint/backup file manipulation leading to data loss
- Dependency vulnerabilities in `package.json`

## Out of Scope

- Issues in development dependencies (devDependencies) that do not affect production builds
- Social engineering attacks
- Physical access attacks
