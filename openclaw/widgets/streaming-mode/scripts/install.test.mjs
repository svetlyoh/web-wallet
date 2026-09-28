import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { HOST_VERSION, ID, install } from './install.mjs';

const BUILD_ID = 'fixture-build';
const publicBuildId = (buildId) => `${buildId}-${'a'.repeat(64)}`;
const index = (buildId, body) => `<html data-openclaw-control-ui-build-id="${publicBuildId(buildId)}"><body>${body}</body></html>`;

function fixture(t, {
  version = HOST_VERSION,
  badChecksum = false,
  chunked = false,
  payloadBuildId = BUILD_ID,
  unsafePath = false,
} = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'streaming-mode-installer-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, 'openclaw');
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
    header.write('../escaped.txt', 0, 'utf8');
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
