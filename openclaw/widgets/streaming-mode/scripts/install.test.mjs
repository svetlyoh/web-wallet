import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { HOST_VERSION, ID, install } from './install.mjs';

function fixture(t, { version = HOST_VERSION, badChecksum = false, chunked = false } = {}) {
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
  writeFileSync(join(target, 'index.html'), 'original');
  writeFileSync(join(target, 'original.txt'), 'keep me');
  writeFileSync(join(payloadFiles, 'index.html'), 'streaming');
  writeFileSync(join(payloadFiles, 'asset-manifest.json'), JSON.stringify({ version: 1, assets: [] }));
  writeFileSync(join(payloadFiles, 'sw.js'), 'self.skipWaiting()');
  const archive = join(payloadRoot, 'control-ui.tar.gz');
  const packed = spawnSync('tar', ['-czf', archive, '-C', payloadFiles, '.'], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  const manifest = {
    schema: 1,
    id: ID,
    hostVersion: HOST_VERSION,
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
  const run = (command, args) => {
    if (command === 'openclaw') return { status: 0, stdout: `OpenClaw ${version}\n`, stderr: '' };
    return spawnSync(command, args, { encoding: 'utf8' });
  };
  const invoke = (action = 'install') => install({ action, root, stateDir, payloadRoot, run, log() {} });
  return { invoke, root, stateDir, target };
}

test('installs, records the marker, and restores the original UI', (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 'installed');
  assert.equal(readFileSync(join(f.target, 'index.html'), 'utf8'), 'streaming');
  assert.equal(JSON.parse(readFileSync(join(f.target, 'streaming-mode-build.json'), 'utf8')).id, ID);
  assert.equal(f.invoke('rollback').status, 'rolled-back');
  assert.equal(readFileSync(join(f.target, 'index.html'), 'utf8'), 'original');
  assert.equal(readFileSync(join(f.target, 'original.txt'), 'utf8'), 'keep me');
});

test('repeat install preserves the first original backup', (t) => {
  const f = fixture(t);
  f.invoke();
  f.invoke();
  f.invoke('rollback');
  assert.equal(readFileSync(join(f.target, 'index.html'), 'utf8'), 'original');
});

test('installs a payload split into individually verified ClawHub-sized chunks', (t) => {
  const f = fixture(t, { chunked: true });
  assert.equal(f.invoke().status, 'installed');
  assert.equal(readFileSync(join(f.target, 'index.html'), 'utf8'), 'streaming');
});

test('rejects another OpenClaw version before changing the UI', (t) => {
  const f = fixture(t, { version: '2026.9.5' });
  assert.throws(() => f.invoke(), /requires OpenClaw/);
  assert.equal(readFileSync(join(f.target, 'index.html'), 'utf8'), 'original');
});

test('rejects a bad payload checksum before making a backup', (t) => {
  const f = fixture(t, { badChecksum: true });
  assert.throws(() => f.invoke(), /checksum/);
  assert.equal(readFileSync(join(f.target, 'index.html'), 'utf8'), 'original');
});

test('refuses rollback when another UI replaced the installed payload', (t) => {
  const f = fixture(t);
  f.invoke();
  rmSync(join(f.target, 'streaming-mode-build.json'));
  assert.throws(() => f.invoke('rollback'), /not the active Control UI/);
});
