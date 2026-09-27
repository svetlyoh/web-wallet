#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ID = 'openclaw-streaming-mode';
export const HOST_VERSION = '2026.9.6';
const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, '..');

function command(commandName, args) {
  return spawnSync(commandName, args, {
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

function packageAt(candidate) {
  try {
    const root = realpathSync(candidate);
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return manifest.name === 'openclaw' ? { root, manifest } : null;
  } catch {
    return null;
  }
}

function ancestors(start) {
  const rows = [];
  let current = start;
  while (current && !rows.includes(current)) {
    rows.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return rows;
}

export function findOpenClawRoot({ env = process.env, run = command } = {}) {
  const candidates = [];
  if (env.OPENCLAW_INSTALL_ROOT) candidates.push(env.OPENCLAW_INSTALL_ROOT);

  const which = run('sh', ['-lc', 'command -v openclaw']);
  if (which.status === 0 && which.stdout.trim()) {
    const executable = realpathSync(which.stdout.trim());
    candidates.push(...ancestors(dirname(executable)));
  }

  const npmRoot = run('npm', ['root', '-g']);
  if (npmRoot.status === 0 && npmRoot.stdout.trim()) {
    candidates.push(join(npmRoot.stdout.trim(), 'openclaw'));
  }

  for (const candidate of candidates) {
    const found = packageAt(candidate);
    if (found) return found;
  }
  throw new Error('Could not locate the OpenClaw package. Set OPENCLAW_INSTALL_ROOT to the folder containing its package.json.');
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function verifyExtracted(stage, payloadManifest) {
  for (const name of ['index.html', 'asset-manifest.json', 'sw.js']) {
    if (!existsSync(join(stage, name))) throw new Error(`Streaming Mode payload is missing ${name}.`);
  }
  const assets = JSON.parse(readFileSync(join(stage, 'asset-manifest.json'), 'utf8')).assets;
  if (!Array.isArray(assets)) throw new Error('Streaming Mode asset manifest is invalid.');
  for (const asset of assets) {
    if (typeof asset?.path !== 'string' || !existsSync(join(stage, asset.path))) {
      throw new Error(`Streaming Mode payload is missing a manifest asset: ${asset?.path ?? 'unknown'}.`);
    }
  }
  atomicJson(join(stage, 'streaming-mode-build.json'), payloadManifest);
}

function swapDirectory(target, stage) {
  const displaced = `${target}.streaming-mode-previous-${process.pid}`;
  renameSync(target, displaced);
  try {
    renameSync(stage, target);
  } catch (error) {
    renameSync(displaced, target);
    throw error;
  }
  rmSync(displaced, { recursive: true, force: true });
}

export function install({
  action = 'install',
  root: suppliedRoot,
  stateDir = process.env.OPENCLAW_STATE_DIR || join(homedir(), '.openclaw'),
  payloadRoot = join(packageDir, 'payload'),
  run = command,
  log = console.log,
} = {}) {
  if (!['install', 'rollback', 'status'].includes(action)) {
    throw new Error('Usage: node scripts/install.mjs [install|rollback|status]');
  }

  const found = suppliedRoot ? packageAt(suppliedRoot) : findOpenClawRoot({ run });
  if (!found) throw new Error('OPENCLAW_INSTALL_ROOT is not an OpenClaw package directory.');
  const { root, manifest: hostManifest } = found;
  if (hostManifest.version !== HOST_VERSION) {
    throw new Error(`This release requires OpenClaw ${HOST_VERSION}; found ${hostManifest.version}. No files were changed.`);
  }

  const cliVersion = run('openclaw', ['--version']);
  if (cliVersion.status !== 0 || !new RegExp(`(?:^|\\s)${HOST_VERSION.replaceAll('.', '\\.')}(?:$|\\s|\\()`).test(cliVersion.stdout)) {
    throw new Error('The openclaw command on PATH does not match the package selected for installation. No files were changed.');
  }

  const target = join(root, 'dist', 'control-ui');
  const statePath = join(stateDir, 'streaming-mode-installer.json');
  const backup = join(stateDir, 'streaming-mode-original-control-ui');
  const marker = join(target, 'streaming-mode-build.json');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null;
  if (state && (state.schema !== 1 || state.id !== ID || state.root !== root)) {
    throw new Error(`The installer record does not match this OpenClaw installation: ${statePath}`);
  }

  if (action === 'status') {
    const active = existsSync(marker);
    log(active ? `Streaming Mode is installed for OpenClaw ${HOST_VERSION}.` : 'Streaming Mode is not active.');
    return { active, state };
  }

  if (!existsSync(join(target, 'index.html'))) {
    throw new Error(`OpenClaw Control UI was not found at ${target}. No files were changed.`);
  }
  accessSync(dirname(target), constants.W_OK);

  const stage = `${target}.streaming-mode-stage-${process.pid}`;
  rmSync(stage, { recursive: true, force: true });
  try {
    if (action === 'rollback') {
      if (!state || !existsSync(backup)) throw new Error(`No tracked backup is available at ${backup}.`);
      if (!existsSync(marker)) throw new Error('Streaming Mode is not the active Control UI; refusing to overwrite the current UI.');
      log('Restoring the original Control UI. This can take a couple more minutes. Please do not interrupt it.');
      cpSync(backup, stage, { recursive: true, errorOnExist: true });
      swapDirectory(target, stage);
      atomicJson(statePath, { ...state, status: 'rolled-back', updatedAt: new Date().toISOString() });
      log('Original Control UI restored. Hard-refresh the browser tab. The Gateway does not need a restart.');
      return { status: 'rolled-back', target };
    }

    const payloadManifestPath = join(payloadRoot, 'manifest.json');
    const payloadManifest = JSON.parse(readFileSync(payloadManifestPath, 'utf8'));
    if (payloadManifest.schema !== 1 || payloadManifest.id !== ID || payloadManifest.hostVersion !== HOST_VERSION) {
      throw new Error('Unexpected Streaming Mode payload manifest.');
    }
    const archive = join(payloadRoot, payloadManifest.archive);
    if (!existsSync(archive) || sha256(archive) !== payloadManifest.sha256) {
      throw new Error('Streaming Mode payload checksum verification failed. No files were changed.');
    }

    log('Preparing the Control UI backup and verified Streaming Mode payload. This can take a couple more minutes. Please do not interrupt it.');
    mkdirSync(stage, { recursive: true });
    const extracted = run('tar', ['-xzf', archive, '-C', stage]);
    if (extracted.status !== 0) throw new Error('Could not extract the Streaming Mode payload. No files were changed.');
    verifyExtracted(stage, payloadManifest);

    if (!state) {
      if (existsSync(backup)) throw new Error(`An untracked backup already exists at ${backup}.`);
      cpSync(target, backup, { recursive: true, errorOnExist: true });
      atomicJson(statePath, {
        schema: 1,
        id: ID,
        root,
        hostVersion: HOST_VERSION,
        backup,
        status: 'prepared',
        createdAt: new Date().toISOString(),
      });
    }

    swapDirectory(target, stage);
    const nextState = JSON.parse(readFileSync(statePath, 'utf8'));
    atomicJson(statePath, { ...nextState, status: 'installed', updatedAt: new Date().toISOString(), payloadSha256: payloadManifest.sha256 });
    log('Streaming Mode installed and verified. Hard-refresh the Control UI, then use the Streaming Mode button. The Gateway does not need a restart.');
    return { status: 'installed', target };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    install({ action: process.argv[2] || 'install' });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
