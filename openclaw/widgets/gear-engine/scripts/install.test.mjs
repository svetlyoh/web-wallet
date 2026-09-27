import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install, ID, FLAG } from './install.mjs';

function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gear-installer-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pluginDir = join(root, 'plugin');
  mkdirSync(join(pluginDir, 'dist/control-ui'), { recursive: true });
  for (const name of ['package.json', 'index.js', 'dist/control-ui/index.js']) writeFileSync(join(pluginDir, name), '{}');
  writeFileSync(join(pluginDir, 'openclaw.plugin.json'), JSON.stringify({ id: ID }));
  const stateDir = join(root, 'state');
  const calls = [];
  let present = options.flag !== undefined;
  let flag = options.flag;
  let installed = options.existing ?? false;
  let enabled = false;
  const result = (value) => ({ status: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' });
  const run = (args) => {
    calls.push(args);
    if (options.fail?.(args)) return { status: 1, stdout: '', stderr: 'fixture failure' };
    if (args[0] === '--version') return result(`OpenClaw ${options.version ?? '2026.9.6'}`);
    if (args[0] === 'config') {
      assert.equal(args[2], FLAG);
      if (args[1] === 'get') return present ? result(flag) : { status: 1, stdout: JSON.stringify({ error: { message: `Config path is valid but unset: ${FLAG}. The runtime default applies.` } }), stderr: '' };
      if (args[1] === 'set') { assert.deepEqual(args.slice(4), ['--strict-json']); flag = JSON.parse(args[3]); present = true; }
      if (args[1] === 'unset') { flag = undefined; present = false; }
      return result('');
    }
    if (args[0] === 'plugins') {
      if (args[1] === 'install') { assert.equal(args[2], pluginDir); assert.equal(args[3], '--force'); installed = true; }
      if (args[1] === 'enable') enabled = true;
      if (args[1] === 'disable') enabled = false;
      if (args[1] === 'inspect') return installed ? result({ plugin: { id: ID, status: enabled ? 'loaded' : 'disabled', imported: enabled } }) : { status: 1, stdout: 'Plugin not found', stderr: '' };
      return result({ ok: true });
    }
    assert.deepEqual(args, ['gateway', 'call', 'plugins.controlUi.list', '--json']);
    return result({ plugins: enabled && flag && !options.missingCatalog ? [{ pluginId: ID }] : [] });
  };
  return { calls, invoke: (action = 'install') => install({ run, action, stateDir, pluginDir, log() {} }), get flag() { return { present, value: flag }; }, get enabled() { return enabled; }, record: () => JSON.parse(readFileSync(join(stateDir, 'gear-engine-installer.json'), 'utf8')) };
}

test('fresh install checks Gateway, copies plugin, enables flag, reloads, verifies runtime and live catalog', (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 'installed');
  assert.deepEqual(f.calls.map((a) => a.slice(0, 2).join(' ')), ['--version', 'config get', 'plugins inspect', 'gateway call', 'plugins install', 'plugins enable', 'config set', 'plugins reload', 'plugins inspect', 'gateway call']);
  assert.equal(f.enabled, true);
  f.invoke('rollback');
  assert.deepEqual(f.flag, { present: false, value: undefined });
  assert.equal(f.enabled, false);
});
test('incompatible host fails before any mutation', (t) => {
  const f = fixture(t, { version: '2026.9.5' });
  assert.throws(() => f.invoke(), /requires OpenClaw/);
  assert.equal(f.calls.length, 1);
});

test('rollback remains available after the host is upgraded', (t) => {
  const options = {};
  const f = fixture(t, options);
  f.invoke();
  options.version = '2026.10.1';
  f.invoke('rollback');
  assert.equal(f.enabled, false);
  assert.deepEqual(f.flag, {present:false,value:undefined});
});
test('rollback restores false and preserves an originally true flag', (t) => {
  for (const flag of [false, true]) {
    const f = fixture(t, { flag });
    f.invoke(); f.invoke('rollback');
    assert.deepEqual(f.flag, { present: true, value: flag });
  }
});
test('failed reload disables plugin and restores prior flag', (t) => {
  const f = fixture(t, { flag: false, fail: (a) => a[1] === 'reload' });
  assert.throws(() => f.invoke(), /was disabled/);
  assert.equal(f.enabled, false);
  assert.equal(f.flag.value, false);
  assert.equal(f.record().status, 'disabled');
});
test('missing browser catalog entry fails and recovers', (t) => {
  const f = fixture(t, { missingCatalog: true });
  assert.throws(() => f.invoke(), /did not publish/);
  assert.equal(f.enabled, false);
  assert.equal(f.flag.present, false);
});
test('repeat install preserves original rollback state', (t) => {
  const f = fixture(t);
  f.invoke(); f.invoke();
  assert.deepEqual(f.record().priorFlag, { present: false });
  f.invoke('rollback');
  assert.equal(f.flag.present, false);
});
test('existing untracked installation is not overwritten', (t) => {
  const f = fixture(t, { existing: true });
  assert.throws(() => f.invoke(), /untracked/);
  assert.equal(f.calls.some((a) => a[1] === 'install'), false);
});
test('unreachable Gateway fails before install', (t) => {
  const f = fixture(t, { fail: (a) => a[0] === 'gateway' });
  assert.throws(() => f.invoke(), /failed/);
  assert.equal(f.calls.some((a) => a[1] === 'install'), false);
});
test('recovery failure stays explicit and retryable', (t) => {
  const f = fixture(t, { fail: (a) => a[1] === 'reload' || a[1] === 'disable' });
  assert.throws(() => f.invoke(), /Recovery incomplete/);
  assert.equal(f.record().status, 'recovery-incomplete');
  assert.equal(f.flag.present, false);
});
