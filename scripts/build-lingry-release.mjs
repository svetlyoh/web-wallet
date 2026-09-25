import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repositoryRoot, 'openclaw', 'skills', 'lingry');
const distRoot = path.join(repositoryRoot, 'dist');
const targetRoot = path.join(distRoot, 'clawhub-lingry');
const githubSkillsRoot = path.join(repositoryRoot, 'skills');
const githubImportRoot = path.join(githubSkillsRoot, 'lingry');
const runtimeFiles = ['SKILL.md', 'README.md', 'INSTALL.json', 'bin/lingry-agent.mjs', 'src/runtime.mjs'];
const releaseFiles = [...runtimeFiles, 'package.json'].sort();
const sourceRepository = 'https://github.com/svetlyoh/web-wallet';
const sourcePath = 'openclaw/skills/lingry';

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

// A deterministic ZIP with stored files. No external ZIP tool or npm package is needed.
function makeZip(files) {
	const localParts = [];
	const centralParts = [];
	let offset = 0;
	for (const file of files) {
		const name = Buffer.from(`lingry/${file.path}`, 'utf8');
		const data = file.bytes;
		const checksum = crc32(data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(33, 12); // 1980-01-01 for repeatable builds.
		local.writeUInt32LE(checksum, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(name.length, 26);
		localParts.push(local, name, data);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(33, 14);
		central.writeUInt32LE(checksum, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE(offset, 42);
		centralParts.push(central, name);
		offset += local.length + name.length + data.length;
	}
	const centralBytes = Buffer.concat(centralParts);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(centralBytes.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...localParts, centralBytes, end]);
}

function listFiles(dir, prefix = '') {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		if (entry.isSymbolicLink()) throw new Error('Symlink in Lingry release payload.');
		const relative = path.posix.join(prefix, entry.name);
		if (entry.isDirectory()) return listFiles(path.join(dir, entry.name), relative);
		if (!entry.isFile()) throw new Error(`Unexpected release entry: ${relative}`);
		return [relative];
	});
}

const sourcePackage = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
const version = sourcePackage.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid Lingry release version.');
if (sourcePackage.name !== '@svetlyoh/lingry' || sourcePackage.engines?.node !== '>=18' ||
	!sourcePackage.dependencies || Object.keys(sourcePackage.dependencies).length !== 0) {
	throw new Error('Unexpected Lingry runtime metadata or dependencies.');
}
const skill = fs.readFileSync(path.join(sourceRoot, 'SKILL.md'), 'utf8');
const install = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'INSTALL.json'), 'utf8'));
if (skill.match(/^version:\s*([^\r\n]+)$/m)?.[1]?.trim() !== version ||
	install.schema !== 'lingry.install.v1' || install.version !== version || install.name !== 'lingry' ||
	install.entry_skill !== 'SKILL.md' || install.runtime?.name !== 'node' ||
	install.runtime?.minimum_version !== '18' ||
	install.source?.repository !== sourceRepository || install.source?.path !== sourcePath ||
	JSON.stringify(install.verify?.command) !== JSON.stringify(['node', 'bin/lingry-agent.mjs', 'verify-install'])) {
	throw new Error('Lingry SKILL.md, INSTALL.json, and package.json versions must match.');
}

if (path.dirname(targetRoot) !== distRoot || path.dirname(distRoot) !== repositoryRoot) throw new Error('Unsafe release output directory.');
for (const directory of [distRoot, targetRoot]) {
	if (fs.existsSync(directory) && (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink())) {
		throw new Error(`Unsafe release output directory: ${directory}`);
	}
}
fs.mkdirSync(distRoot, { recursive: true });
if (fs.existsSync(targetRoot)) fs.rmSync(targetRoot, { recursive: true });
fs.mkdirSync(targetRoot);

for (const relative of runtimeFiles) {
	const source = path.join(sourceRoot, relative);
	const stat = fs.lstatSync(source);
	if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe source file: ${relative}`);
	const destination = path.join(targetRoot, relative);
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	fs.copyFileSync(source, destination);
}

// Do not ship source-only test scripts, development file lists, or lifecycle hooks.
const stagedPackage = {
	name: sourcePackage.name,
	version,
	type: 'module',
	bin: { 'lingry-agent': 'bin/lingry-agent.mjs' },
	dependencies: {},
	engines: { node: '>=18' }
};
fs.writeFileSync(path.join(targetRoot, 'package.json'), JSON.stringify(stagedPackage, null, 2) + '\n');

const actual = listFiles(targetRoot).sort();
if (JSON.stringify(actual) !== JSON.stringify(releaseFiles)) throw new Error('Unexpected Lingry release contents.');
for (const relative of actual) {
	if (/(^|\/)(?:test|tests|coverage|node_modules|\.git|\.lingry)(\/|$)|(^|\/)\.env|\.wif$|\.key$/i.test(relative)) {
		throw new Error(`Forbidden Lingry release path: ${relative}`);
	}
	const contents = fs.readFileSync(path.join(targetRoot, relative), 'utf8');
	if (/child_process|\bexec\s*\(|execSync\s*\(|\bspawn\s*\(|shell\s*:\s*true|LINGRY_AGENT_STATE_PATH|LINGRY_API_BASE_URL|agent_secret|refresh_token|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(contents)) {
		throw new Error(`Forbidden content in ${relative}.`);
	}
}

const verify = spawnSync(process.execPath, [path.join(targetRoot, 'bin', 'lingry-agent.mjs'), 'verify-install'], {
	cwd: targetRoot, encoding: 'utf8', timeout: 10_000
});
if (verify.status !== 0 || JSON.parse(verify.stdout || '{}').ok !== true) {
	throw new Error(`Staged Lingry verification failed: ${verify.stderr || verify.stdout}`);
}

const files = actual.map(relative => {
	const bytes = fs.readFileSync(path.join(targetRoot, relative));
	return { path: relative, bytes, sha256: sha256(bytes) };
});
if (path.dirname(githubImportRoot) !== githubSkillsRoot || path.dirname(githubSkillsRoot) !== repositoryRoot) {
	throw new Error('Unsafe GitHub import directory.');
}
for (const directory of [githubSkillsRoot, githubImportRoot]) {
	if (fs.existsSync(directory) && (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink())) {
		throw new Error(`Unsafe GitHub import directory: ${directory}`);
	}
}
fs.mkdirSync(githubSkillsRoot, { recursive: true });
if (fs.existsSync(githubImportRoot)) fs.rmSync(githubImportRoot, { recursive: true });
fs.mkdirSync(githubImportRoot);
for (const file of files) {
	const destination = path.join(githubImportRoot, file.path);
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	fs.copyFileSync(path.join(targetRoot, file.path), destination);
}
if (JSON.stringify(listFiles(githubImportRoot).sort()) !== JSON.stringify(actual)) {
	throw new Error('GitHub import folder differs from the staged ClawHub payload.');
}
const stagedManifest = {
	name: 'lingry', version,
	source: { repository: sourceRepository, path: sourcePath, github_import_path: 'skills/lingry' },
	files: files.map(({ path: filePath, sha256: hash }) => ({ path: filePath, sha256: hash }))
};
fs.writeFileSync(path.join(distRoot, 'clawhub-lingry-manifest.json'), JSON.stringify(stagedManifest, null, 2) + '\n');

const archive = `lingry-skill-${version}.zip`;
const zip = makeZip(files);
fs.writeFileSync(path.join(distRoot, archive), zip);
const archiveHash = sha256(zip);
fs.writeFileSync(path.join(distRoot, `${archive}.sha256`), `${archiveHash}  ${archive}\n`);
fs.writeFileSync(path.join(distRoot, `lingry-skill-${version}.manifest.json`), JSON.stringify({
	name: 'lingry', version, archive, sha256: archiveHash,
	source_repository: sourceRepository, source_path: sourcePath,
	files: stagedManifest.files
}, null, 2) + '\n');

console.log(actual.join('\n'));
