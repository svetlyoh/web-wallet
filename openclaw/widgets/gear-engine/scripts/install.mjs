#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const ID = 'openclaw-gear-engine';
export const HOST = '2026.9.6';
export const FLAG = 'gateway.controlUi.experimental.customPlugins';
const here = dirname(fileURLToPath(import.meta.url));

// Keep subprocess output private: a CLI failure can include configuration details.
export function cli(args) {
  const result = spawnSync('openclaw', args, { encoding: 'utf8', timeout: 120000, env: { ...process.env, NO_COLOR: '1' } });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error };
}

export function install({ run = cli, action = 'install', stateDir = process.env.OPENCLAW_STATE_DIR || join(homedir(), '.openclaw'), pluginDir = resolve(here, '../plugin'), log = console.log } = {}) {
  const statePath = join(stateDir, 'gear-engine-installer.json');
  const call = (args) => {
    const result = run(args);
    if (result.status !== 0) throw new Error(`openclaw ${args.slice(0, 3).join(' ')} failed (exit ${result.status}). Run that command directly for diagnostics.`);
    return result.stdout.trim();
  };
  const json = (args) => { const out = call(args); try { return JSON.parse(out); } catch { throw new Error(`Invalid JSON from openclaw ${args.slice(0, 3).join(' ')}.`); } };
  const readFlag = () => {
    const result = run(['config', 'get', FLAG, '--json']);
    if (result.status === 0) {
      const value = JSON.parse(result.stdout);
      if (typeof value !== 'boolean') throw new Error('The customPlugins flag is not a boolean; refusing to change it.');
      return { present: true, value };
    }
    if (`${result.stdout}\n${result.stderr}`.includes(`Config path is valid but unset: ${FLAG}.`)) return { present: false };
    throw new Error('Cannot read the customPlugins setting; no configuration was changed.');
  };
  let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null;
  if (state && (state.id !== ID || state.schema !== 1)) throw new Error(`Unrecognized installer record: ${statePath}`);
  const save = () => {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(`${statePath}.tmp`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    renameSync(`${statePath}.tmp`, statePath);
  };
  const recover = () => {
    const failures = [];
    if (state.installAttempted) {
      try { call(['plugins', 'disable', ID]); } catch (e) { failures.push(e.message); }
    }
    if (state.flagChanged) {
      try {
        const current = readFlag();
        if (current.present && current.value === true) {
          if (state.priorFlag.present) call(['config', 'set', FLAG, JSON.stringify(state.priorFlag.value), '--strict-json']);
          else call(['config', 'unset', FLAG]);
        }
        state.flagChanged = false;
      } catch (e) { failures.push(e.message); }
    }
    state.status = failures.length ? 'recovery-incomplete' : 'disabled';
    save();
    if (failures.length) throw new Error(`Recovery incomplete. Retry rollback after resolving: ${failures.join(' ')}`);
  };
  const version = call(['--version']);
  if (!new RegExp(`(?:^|\\s)${HOST.replaceAll('.', '\\.')}($|\\s|\\()`).test(version)) throw new Error(`This release requires OpenClaw ${HOST}; found ${version}. No upgrade was attempted.`);
  if (action === 'rollback') {
    if (!state) throw new Error(`No installer record at ${statePath}; refusing to change an untracked install.`);
    recover();
    log('Gear Engine disabled; the custom UI setting was restored where it still matched the installer value. Reload the Control UI.');
    return state;
  }
  if (action !== 'install') throw new Error('Usage: node scripts/install.mjs [install|rollback]');
  for (const name of ['package.json', 'index.js', 'openclaw.plugin.json', 'dist/control-ui/index.js']) {
    if (!existsSync(join(pluginDir, name))) throw new Error(`Missing prebuilt plugin file: ${name}`);
  }
  const manifest = JSON.parse(readFileSync(join(pluginDir, 'openclaw.plugin.json'), 'utf8'));
  if (manifest.id !== ID) throw new Error('Unexpected plugin manifest id.');
  const flag = readFlag();
  const installed = run(['plugins', 'inspect', ID, '--json']);
  if (installed.status === 0 && !state) throw new Error(`An untracked ${ID} is already installed. Preserve or remove that installation before using this installer.`);
  if (installed.status !== 0 && !/not found|unknown plugin|no plugin/i.test(`${installed.stdout}\n${installed.stderr}`)) throw new Error('Cannot determine existing plugin state; refusing to overwrite it.');
  // Verify authentication and the running Gateway before mutating config or files.
  json(['gateway', 'call', 'plugins.controlUi.list', '--json']);
  if (!state || state.status === 'disabled') state = { schema: 1, id: ID, priorFlag: flag, flagChanged: false, installAttempted: false, status: 'prepared' };
  save();
  try {
    state.installAttempted = true;
    state.status = 'installing';
    save();
    call(['plugins', 'install', pluginDir, '--force']);
    call(['plugins', 'enable', ID]);
    if (!flag.present || flag.value !== true) {
      state.flagChanged = true;
      save(); // Recovery also works after an interrupted config write.
      call(['config', 'set', FLAG, 'true', '--strict-json']);
    }
    call(['plugins', 'reload', ID, '--json']);
    const runtime = json(['plugins', 'inspect', ID, '--runtime', '--json']);
    if (runtime.plugin?.id !== ID || runtime.plugin?.status !== 'loaded' || runtime.plugin?.imported !== true) throw new Error('The plugin did not pass runtime loading verification.');
    const catalog = json(['gateway', 'call', 'plugins.controlUi.list', '--json']);
    if (!catalog.plugins?.some((plugin) => (plugin.pluginId ?? plugin.id) === ID)) throw new Error('The running Gateway did not publish Gear Engine in its browser plugin catalog.');
    state.status = 'installed';
    save();
    log('Gear Engine installed and verified in the running Gateway catalog. Reload the Control UI using HTTPS or localhost to activate the widget.');
    return state;
  } catch (error) {
    try { recover(); } catch (recovery) { throw new Error(`${error.message}\n${recovery.message}\nRecovery record: ${statePath}`); }
    throw new Error(`${error.message}\nGear Engine was disabled and the installer setting restored. Plugin files are retained for diagnosis. Retry this installer after resolving the failure.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { install({ action: process.argv[2] || 'install' }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
