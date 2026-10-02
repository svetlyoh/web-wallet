import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoOpenClaw = join(root, '..', '..');
const tarExecutable = process.platform === 'win32'
  ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  : 'tar';

function read(path) {
  return readFileSync(path, 'utf8');
}

function archiveText(archive) {
  const extractedRoot = mkdtempSync(join(tmpdir(), 'streaming-mode-contract-'));
  try {
    const extracted = spawnSync(tarExecutable, ['-xzf', archive, '-C', extractedRoot], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(extracted.status, 0, extracted.stderr);

    const scripts = [];
    const visit = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        if (entry.isFile() && entry.name.endsWith('.js')) scripts.push(path);
      }
    };
    visit(join(extractedRoot, 'assets'));
    assert.ok(scripts.length > 0, 'Control UI payload has no JavaScript assets');
    return scripts.map(read).join('\n');
  } finally {
    rmSync(extractedRoot, { recursive: true, force: true });
  }
}

function archiveFile(archive, entry) {
  const extracted = spawnSync(tarExecutable, ['-xOzf', archive, entry], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  assert.equal(extracted.status, 0, extracted.stderr);
  return extracted.stdout;
}

test('streaming layout keeps the native session-header accessory host', () => {
  const sourcePatch = read(join(root, 'source', 'openclaw-2026.9.6-streaming-mode.patch'));

  // OpenClaw omits session-header accessories only when the chat pane is compact.
  // Streaming Mode must therefore keep mergedChatChrome false while it is active.
  assert.match(
    sourcePatch,
    /const mergedChatChrome = !streamingMode && shouldMergeChatChrome\(\{/u,
  );
  assert.doesNotMatch(sourcePatch, /compact:\s*streamingMode/u);

  const archive = join(root, 'payload', 'control-ui.tar.gz');
  const manifest = JSON.parse(read(join(root, 'payload', 'manifest.json')));
  const indexHtml = archiveFile(archive, './index.html');
  assert.match(
    indexHtml,
    new RegExp(`data-openclaw-control-ui-build-id=["']${manifest.gatewayBuildId}-[a-f0-9]{64}["']`, 'u'),
  );

  const payload = archiveText(archive);
  assert.match(payload, /shell--streaming/u);
  assert.match(payload, /session-header/u);
  assert.match(payload, /openclaw-plugin-contributions/u);
});

test('streaming layout leaves composer and navigation behavior owned by OpenClaw', () => {
  const sourcePatch = read(join(root, 'source', 'openclaw-2026.9.6-streaming-mode.patch'));

  for (const path of [
    'ui/src/app/mobile-nav-layout.ts',
    'ui/src/pages/chat/chat-view.ts',
    'ui/src/pages/chat/components/chat-composer-state.ts',
    'ui/src/pages/chat/components/chat-composer-types.ts',
  ]) {
    assert.doesNotMatch(sourcePatch, new RegExp(`diff --git a/${path.replaceAll('.', '\\.')}`, 'u'));
  }
  assert.doesNotMatch(sourcePatch, /streamingCollapsed|streaming-composer-toggle/u);
});

test('Gear Engine uses that host and remains visible in its available width', () => {
  const gearSource = read(join(repoOpenClaw, 'widgets', 'gear-engine', 'src', 'control-ui.ts'));
  const gearView = read(join(repoOpenClaw, 'widgets', 'gear-engine', 'src', 'gear-view.ts'));

  assert.match(gearSource, /placement:\s*['"]session-header['"]/u);
  assert.match(gearView, /max-width:100%;height:auto/u);
});
