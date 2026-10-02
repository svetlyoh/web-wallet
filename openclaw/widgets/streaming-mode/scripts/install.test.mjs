import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { HOST_VERSION, ID, findOpenClawRoot, install } from './install.mjs';

const BUILD_ID = 'fixture-build';
const publicBuildId = (buildId) => `${buildId}-${'a'.repeat(64)}`;
const index = (buildId, body) => `<html data-openclaw-control-ui-build-id="${publicBuildId(buildId)}"><body>${body}</body></html>`;

function fixture(t, {
  version = HOST_VERSION,
  badChecksum = false,
  chunked = false,
  payloadBuildId = BUILD_ID,
  unsafePath = false,
  archivePath = '../escaped.txt',
} = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'streaming-mode-installer-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, 'OpenClaw package with spaces');
  const target = join(root, 'dist', 'control-ui');
  const payloadRoot = join(temp, 'payload');
  const payloadFiles = join(temp, 'payload-files');
  const stateDir = join(temp, 'state');
  mkdirSync(target, { recursive: true });
  mkdirSync(payloadRoot, { recursive: true });
  mkdirSync(payloadFiles, { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'openclaw', version }));
  writeFileSync(join(root, 'dist', 'build-info.json'), JSON.stringify({ version, buildId: BUILD_ID }));
  writeFileSync(join(target, 'index.html'), index(BUILD_ID, 'original'));
  writeFileSync(join(target, 'original.txt'), 'keep me');
  writeFileSync(join(payloadFiles, 'index.html'), index(payloadBuildId, 'streaming'));
  writeFileSync(join(payloadFiles, 'asset-manifest.json'), JSON.stringify({ version: 1, assets: [] }));
  writeFileSync(join(payloadFiles, 'sw.js'), 'self.skipWaiting()');
  const archive = join(payloadRoot, 'control-ui.tar.gz');
  const packed = spawnSync('tar', ['-czf', archive, '-C', payloadFiles, '.'], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  if (unsafePath) {
    const header = Buffer.alloc(512);
    header.write(archivePath, 0, 'utf8');
    header.write('0000644\0', 100, 'ascii');
    header.write('0000000\0', 108, 'ascii');
    header.write('0000000\0', 116, 'ascii');
    header.write('00000000000\0', 124, 'ascii');
    header.write('00000000000\0', 136, 'ascii');
    header.fill(32, 148, 156);
    header.write('0', 156, 'ascii');
    header.write('ustar\0', 257, 'ascii');
    header.write('00', 263, 'ascii');
    const checksum = header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0');
    header.write(`${checksum}\0 `, 148, 'ascii');
    writeFileSync(archive, gzipSync(Buffer.concat([header, Buffer.alloc(1024)])));
  }
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  const manifest = {
    schema: 1,
    id: ID,
    hostVersion: HOST_VERSION,
    gatewayBuildId: payloadBuildId,
    archive: 'control-ui.tar.gz',
    sha256: badChecksum ? '0'.repeat(64) : digest,
    sourceCommit: 'fixture',
  };
  if (chunked) {
    const content = readFileSync(archive);
    const midpoint = Math.ceil(content.length / 2);
    const chunks = [content.subarray(0, midpoint), content.subarray(midpoint)].map((part, index) => {
      const file = `control-ui.tar.gz.part-${String(index + 1).padStart(3, '0')}`;
      writeFileSync(join(payloadRoot, file), part);
      return { file, size: part.length, sha256: createHash('sha256').update(part).digest('hex') };
    });
    rmSync(archive);
    manifest.schema = 2;
    manifest.chunks = chunks;
  }
  writeFileSync(join(payloadRoot, 'manifest.json'), JSON.stringify(manifest));
  const invoke = (action = 'install') => install({ action, root, stateDir, payloadRoot, log() {} });
  return { invoke, root, stateDir, target };
}

test('installs, records the marker, and restores the original UI', (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 'installed');
  assert.match(readFileSync(join(f.target, 'index.html'), 'utf8'), /streaming/);
  assert.equal(JSON.parse(readFileSync(join(f.target, 'streaming-mode-build.json'), 'utf8')).id, ID);
  assert.equal(f.invoke('rollback').status, 'rolled-back');
  assert.match(readFileSync(join(f.target, 'index.html'), 'utf8'), /original/);
  assert.equal(readFileSync(join(f.target, 'original.txt'), 'utf8'), 'keep me');
});

test('repeat install preserves the first original backup', (t) => {
  const f = fixture(t);
  f.invoke();
  f.invoke();
  f.invoke('rollback');
  assert.match(readFileSync(join(f.target, 'index.html'), 'utf8'), /original/);
});

test('installs a payload split into individually verified ClawHub-sized chunks', (t) => {
  const f = fixture(t, { chunked: true });
  assert.equal(f.invoke().status, 'installed');
  assert.match(readFileSync(join(f.target, 'index.html'), 'utf8'), /streaming/);
});

test('rejects another OpenClaw version before changing the UI', (t) => {
  const f = fixture(t, { version: '2026.9.5' });
  assert.throws(() => f.invoke(), /requires OpenClaw/);
  assert.match(readFileSync(join(f.target, 'index.html'), 'utf8'), /original/);
});

test('rejects a bad payload checksum before making a backup', (t) => {
  const f = fixture(t, { badChecksum: true });
  assert.throws(() => f.invoke(), /checksum/);
  assert.match(readFileSync(join(f.target, 'index.html'), 'utf8'), /original/);
});

test('rejects an archive entry that escapes the staging directory', (t) => {
  const f = fixture(t, { unsafePath: true });
  assert.throws(() => f.invoke(), /unsafe path/);
  assert.match(readFileSync(join(f.target, 'index.html'), 'utf8'), /original/);
});

test('rejects a payload built for another Gateway identity before making a backup', (t) => {
  const f = fixture(t, { payloadBuildId: 'another-build' });
  assert.throws(() => f.invoke(), /payload manifest/);
  assert.match(readFileSync(join(f.target, 'index.html'), 'utf8'), /original/);
});

test('refuses rollback when another UI replaced the installed payload', (t) => {
  const f = fixture(t);
  f.invoke();
  rmSync(join(f.target, 'streaming-mode-build.json'));
  assert.throws(() => f.invoke('rollback'), /not the active Control UI/);
});

function discoveryFixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'streaming-discovery-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const bin = join(temp, 'npm prefix with spaces');
  const root = join(bin, 'node_modules', 'openclaw');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'openclaw', version: HOST_VERSION }));
  return { temp, bin, root, options: { home: temp, execPath: join(temp, 'missing-node') } };
}

for (const shim of ['openclaw.cmd', 'openclaw.ps1']) {
  test(`discovers a Windows npm installation through ${shim} without executing it`, (t) => {
    const f = discoveryFixture(t);
    writeFileSync(join(f.bin, shim), 'this shim must never execute');
    assert.equal(findOpenClawRoot({ ...f.options, platform: 'win32', env: { PATH: f.bin } }).root, realpathSync(f.root));
  });
}

test('discovers Windows roaming npm prefix when it is absent from PATH', (t) => {
  const f = discoveryFixture(t);
  const appData = join(f.temp, 'AppData', 'Roaming');
  const root = join(appData, 'npm', 'node_modules', 'openclaw');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'openclaw' }));
  assert.equal(findOpenClawRoot({ ...f.options, platform: 'win32', env: { APPDATA: appData } }).root, realpathSync(root));
});

test('discovers macOS/Linux npm symlinks into the package', { skip: process.platform === 'win32' }, (t) => {
  const f = discoveryFixture(t);
  const entry = join(f.root, 'openclaw.mjs');
  writeFileSync(entry, 'not executed');
  symlinkSync(entry, join(f.bin, 'openclaw'));
  for (const platform of ['linux', 'darwin']) {
    assert.equal(findOpenClawRoot({ ...f.options, platform, env: { PATH: f.bin } }).root, realpathSync(f.root));
  }
});

test('rejects an invalid explicit package root instead of patching another installation', (t) => {
  const f = discoveryFixture(t);
  writeFileSync(join(f.bin, 'openclaw.cmd'), 'not executed');
  assert.throws(() => findOpenClawRoot({ ...f.options, platform: 'win32', env: { PATH: f.bin, OPENCLAW_INSTALL_ROOT: f.temp } }), /not an OpenClaw package/);
});

for (const archivePath of ['C:/escaped.txt', 'assets/file.txt:stream', 'assets/NUL.txt', 'assets/trailing.']) {
  test(`rejects nonportable archive path ${archivePath} before changing the UI`, (t) => {
    const f = fixture(t, { unsafePath: true, archivePath });
    assert.throws(() => f.invoke(), /unsafe path/);
    assert.match(readFileSync(join(f.target, 'index.html'), 'utf8'), /original/);
  });
}
