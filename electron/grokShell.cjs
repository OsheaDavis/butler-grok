const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { DATA_DIR } = require('./appContext.cjs');

function resolveGrokExe() {
  const candidates = [
    path.join(os.homedir(), '.grok', 'bin', 'grok.exe'),
    path.join(os.homedir(), '.grok', 'bin', 'grok.cmd'),
    path.join(os.homedir(), '.local', 'bin', 'grok.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'grok';
}

/**
 * Open a persistent console window that runs a .cmd script.
 * Uses `start` so the console is detached from Electron and cannot flash-close
 * when the parent process continues.
 */
function openPersistentCmd(scriptPath, title) {
  const titleSafe = String(title || 'ButlerGrok').replace(/["&<>|]/g, ' ').slice(0, 40);
  // cmd /c start "window title" cmd /k script.cmd
  // First quoted token after start is ALWAYS the window title on Windows.
  const child = spawn(
    process.env.ComSpec || 'cmd.exe',
    ['/c', 'start', titleSafe, process.env.ComSpec || 'cmd.exe', '/k', scriptPath],
    {
      detached: true,
      shell: false,
      windowsHide: true, // hide the short-lived launcher; the started window is visible
      stdio: 'ignore',
      env: process.env,
      cwd: os.homedir(),
    }
  );
  child.on('error', (err) => {
    console.error('openPersistentCmd failed', err);
  });
  child.unref();
}

function startGrokShell() {
  const grokExe = resolveGrokExe();
  const grokDir = path.dirname(grokExe);
  const scriptsDir = path.join(DATA_DIR, 'tmp');
  if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, `butler-start-grok-${Date.now()}.cmd`);
  const lines = [
    '@echo off',
    'setlocal EnableExtensions',
    'title Butler Grok - Start Grok Build',
    'echo === Butler Grok ===',
    'echo Starting Grok Build...',
    'echo.',
    `if not exist "${grokExe}" (`,
    '  echo ERROR: grok.exe not found.',
    '  echo Path: ' + grokExe,
    '  pause',
    '  exit /b 1',
    ')',
    `set "PATH=${grokDir};%PATH%"`,
    `cd /d "${grokDir}"`,
    'grok',
    'echo.',
    'echo Grok exited. Press any key to close...',
    'pause >nul',
  ];
  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8');
  openPersistentCmd(scriptPath, 'Butler Grok - Grok Build');
}


module.exports = {
  resolveGrokExe,
  openPersistentCmd,
  startGrokShell,
};
