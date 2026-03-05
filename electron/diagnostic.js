const { app } = require('electron');
console.log('--- DIAGNOSTIC START ---');
console.log('Process Type:', process.type);
console.log('Electron Version:', process.versions.electron);
console.log('Require Electron Type:', typeof require('electron'));
console.log('Require Electron Value:', require('electron'));

try {
    const Module = require('module');
    console.log('Module._load("electron", null, true) type:', typeof Module._load('electron', null, true));
} catch (e) {
    console.log('Module._load failed:', e.message);
}

try {
    console.log('require("node:electron") type:', typeof require('node:electron'));
} catch (e) {
    console.log('require("node:electron") failed:', e.message);
}

app.quit();
