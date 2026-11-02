#!/usr/bin/env node
/**
 * Lab Notes eval durability: online SQLite backup (+ uploads), restore proof on 5195,
 * disposable blog_post version rollback on live 5192.
 *
 * Does not stop 5192 for backup.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
	cp,
	mkdir,
	readFile,
	readdir,
	rm,
	writeFile,
	stat
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { signInEmail } from './oauth-token.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.join(__dirname, '../..');
const dataRoot =
	process.env.LAB_NOTES_DATA_DIR ?? path.join(studioRoot, '.aphex/lab-notes-eval');
const liveBase = process.env.LAB_NOTES_BASE ?? 'http://127.0.0.1:5192';
const restorePort = Number(process.env.LAB_NOTES_RESTORE_PORT ?? 5195);
const restoreBase = `http://127.0.0.1:${restorePort}`;
const publishedSlug =
	process.env.LAB_NOTES_PROOF_SLUG ?? 'swapping-the-engine-is-the-easy-part';

const defaultDbRel = '.aphex/lab-notes-eval.db';
const defaultUploadsRel = '.aphex/lab-notes-uploads';

function tsSlug() {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

async function readMcpKey() {
	return (await readFile(path.join(dataRoot, 'mcp-api-key.txt'), 'utf8')).trim();
}

async function mcp(apiKey, name, args, base = liveBase) {
	const response = await fetch(`${base}/mcp`, {
		method: 'POST',
		headers: {
			'x-api-key': apiKey,
			accept: 'application/json, text/event-stream',
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: `${name}-${Date.now()}`,
			method: 'tools/call',
			params: { name, arguments: args }
		})
	});
	assert.equal(response.status, 200, `${name} HTTP`);
	const text = await response.text();
	const line = text.split('\n').find((l) => l.startsWith('data: '));
	const payload = JSON.parse(line.slice(6));
	const inner = JSON.parse(payload.result.content[0].text);
	if (payload.result.isError || inner.success === false) {
		throw new Error(inner.error ?? `${name} failed`);
	}
	return inner.data ?? inner;
}

function sqliteBackupOnline(sourcePath, destPath) {
	const result = spawnSync('sqlite3', [sourcePath, `.backup '${destPath.replace(/'/g, "''")}'`], {
		encoding: 'utf8'
	});
	if (result.status !== 0) {
		throw new Error(result.stderr || result.stdout || 'sqlite3 backup failed');
	}
	const check = spawnSync('sqlite3', [destPath, 'PRAGMA integrity_check;'], { encoding: 'utf8' });
	const line = (check.stdout || '').trim().split('\n')[0];
	if (line !== 'ok') throw new Error(`integrity_check: ${line}`);
}

function mediaPathFromString(url) {
	if (!url || typeof url !== 'string') return null;
	try {
		const u = url.startsWith('http') ? new URL(url) : new URL(url, 'http://local');
		if (u.pathname.startsWith('/media/')) return u.pathname;
	} catch {
		/* ignore */
	}
	return null;
}

function firstMediaPath(value) {
	const direct = mediaPathFromString(typeof value === 'string' ? value : null);
	if (direct) return direct;
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const url = /** @type {{ url?: string }} */ (value).url;
		const fromUrl = mediaPathFromString(url);
		if (fromUrl) return fromUrl;
	}
	if (Array.isArray(value)) {
		for (const v of value) {
			const found = firstMediaPath(v);
			if (found) return found;
		}
	}
	if (value && typeof value === 'object') {
		for (const v of Object.values(value)) {
			const found = firstMediaPath(v);
			if (found) return found;
		}
	}
	return null;
}

async function resolvePaths() {
	const dbPath = path.resolve(
		studioRoot,
		(process.env.APHEX_SQLITE_URL ?? `file:${defaultDbRel}`).replace(/^file:/, '')
	);
	const uploadsPath = path.resolve(
		studioRoot,
		process.env.APHEX_UPLOADS_DIR ?? defaultUploadsRel
	);
	return { dbPath, uploadsPath };
}

/** @returns {Promise<string>} snapshot directory */
export async function runBackup() {
	const { dbPath, uploadsPath } = await resolvePaths();
	const snapshotDir = path.join(dataRoot, 'snapshots', tsSlug());
	await mkdir(snapshotDir, { recursive: true });

	const backupDb = path.join(snapshotDir, 'lab-notes-eval.db');
	sqliteBackupOnline(dbPath, backupDb);

	const uploadsDest = path.join(snapshotDir, 'uploads');
	await cp(uploadsPath, uploadsDest, { recursive: true, force: true });

	const manifest = {
		createdAt: new Date().toISOString(),
		sourceDb: dbPath,
		sourceUploads: uploadsPath,
		backupDb,
		uploadsDest,
		method: 'sqlite3 .backup (online-safe, WAL consolidated in backup file)'
	};
	await writeFile(path.join(snapshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
	return snapshotDir;
}

async function latestSnapshot() {
	const root = path.join(dataRoot, 'snapshots');
	let entries;
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		throw new Error('No snapshots — run: node scripts/lab-notes/backup-restore.mjs backup');
	}
	const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
	if (!dirs.length) throw new Error('No snapshot directories');
	return path.join(root, dirs.at(-1));
}

async function waitHttpOk(url, attempts = 40, delayMs = 500) {
	for (let i = 0; i < attempts; i++) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
			if (res.status === 200) return;
		} catch {
			/* retry */
		}
		await new Promise((r) => setTimeout(r, delayMs));
	}
	throw new Error(`Timeout waiting for ${url}`);
}

async function killPort(port) {
	const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
		encoding: 'utf8'
	});
	const pids = (result.stdout || '')
		.trim()
		.split('\n')
		.filter(Boolean);
	for (const pid of pids) {
		try {
			process.kill(Number(pid), 'SIGTERM');
		} catch {
			/* gone */
		}
	}
	await new Promise((r) => setTimeout(r, 500));
}

async function loadEnvLabNotes() {
	const envPath = path.join(studioRoot, '.env.lab-notes');
	const text = await readFile(envPath, 'utf8');
	/** @type {Record<string, string>} */
	const env = { ...process.env };
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
	}
	return env;
}

export async function runRestoreProof(snapshotDir) {
	const restoreRoot = path.join(dataRoot, 'restore-drill', tsSlug());
	await mkdir(restoreRoot, { recursive: true });
	const uploadsMirror = path.join(restoreRoot, '.aphex', 'lab-notes-uploads');

	const backupDb = path.join(snapshotDir, 'lab-notes-eval.db');
	await stat(backupDb);
	await cp(backupDb, path.join(restoreRoot, 'lab-notes-eval.db'));
	await mkdir(path.dirname(uploadsMirror), { recursive: true });
	await cp(path.join(snapshotDir, 'uploads'), uploadsMirror, {
		recursive: true
	});

	const evalSidecar = path.join(restoreRoot, 'eval-sidecar');
	await mkdir(evalSidecar, { recursive: true });
	await cp(path.join(dataRoot, 'mcp-api-key.txt'), path.join(evalSidecar, 'mcp-api-key.txt')).catch(
		() => {}
	);

	const baseEnv = await loadEnvLabNotes();
	const childEnv = {
		...baseEnv,
		HOST: '127.0.0.1',
		PORT: String(restorePort),
		ORIGIN: restoreBase,
		AUTH_URL: restoreBase,
		AUTH_TRUSTED_ORIGINS: restoreBase,
		APHEX_SQLITE_URL: 'file:./lab-notes-eval.db',
		APHEX_UPLOADS_DIR: '.aphex/lab-notes-uploads',
		LAB_NOTES_DATA_DIR: evalSidecar,
		APHEX_SEED: 'false'
	};

	await killPort(restorePort);

	const logPath = path.join(restoreRoot, 'server.log');
	const logFd = await import('node:fs').then((fs) =>
		fs.openSync(logPath, 'a')
	);
	const child = spawn(process.execPath, [path.join(studioRoot, 'build/index.js')], {
		cwd: restoreRoot,
		env: childEnv,
		detached: true,
		stdio: ['ignore', logFd, logFd]
	});
	child.unref();

	/** @type {{ post: number; media: number | null; restoreRoot: string }} */
	const proof = { post: 0, media: null, restoreRoot };

	try {
		await waitHttpOk(`${restoreBase}/blog`);
		const postRes = await fetch(
			`${restoreBase}/api/lab-notes/public/blog-posts/${publishedSlug}`
		);
		proof.post = postRes.status;
		assert.equal(proof.post, 200, 'restored published post');

		const body = await postRes.json();
		let mediaPath = firstMediaPath(body.data?.coverImage ?? body.data);
		if (!mediaPath) {
			const listRes = await fetch(`${restoreBase}/api/lab-notes/public/blog-posts`);
			if (listRes.status === 200) {
				const listBody = await listRes.json();
				for (const row of listBody.data ?? []) {
					mediaPath = firstMediaPath(row.coverImage);
					if (mediaPath) break;
				}
			}
		}
		if (mediaPath) {
			const mediaRes = await fetch(`${restoreBase}${mediaPath}`);
			proof.media = mediaRes.status;
			assert.equal(proof.media, 200, 'restored media');
		} else {
			proof.media = 0;
		}
	} finally {
		await killPort(restorePort);
		try {
			process.kill(child.pid, 'SIGTERM');
		} catch {
			/* exited */
		}
	}

	return proof;
}

function minimalBlock(text) {
	return [
		{
			_type: 'block',
			_key: 'durability',
			style: 'normal',
			markDefs: [],
			children: [{ _type: 'span', _key: 's1', text, marks: [] }]
		}
	];
}

async function loadEvalIdentities() {
	return JSON.parse(await readFile(path.join(dataRoot, 'eval-identities.json'), 'utf8'));
}

export async function runRollbackProof() {
	const apiKey = await readMcpKey();
	const identities = await loadEvalIdentities();
	const staffCookie = await signInEmail(
		liveBase,
		identities.users.staffA.email,
		identities.users.staffA.password
	);
	const slug = `durability-rollback-${Date.now()}`;
	const titleV1 = 'Durability rollback v1';
	const titleV2 = 'Durability rollback v2 edited';

	const created = await mcp(apiKey, 'create_document', {
		collection: 'blog_post',
		data: {
			title: titleV1,
			slug,
			excerpt: 'Disposable durability drill document',
			content: minimalBlock('version one body')
		}
	});
	const docId = created.document?.id ?? created.id;
	assert.ok(docId, 'create returned id');

	await mcp(apiKey, 'update_document', {
		collection: 'blog_post',
		id: docId,
		data: {
			title: titleV2,
			content: minimalBlock('version two body')
		}
	});

	const versionsRes = await fetch(`${liveBase}/api/documents/${docId}/versions`, {
		headers: { origin: liveBase, cookie: staffCookie }
	});
	assert.equal(versionsRes.status, 200, 'list versions');
	const versionsBody = await versionsRes.json();
	const versions = versionsBody.data ?? [];
	assert.ok(versions.length >= 2, 'at least two versions after edit');
	const oldest = versions.reduce((a, b) =>
		a.versionNumber < b.versionNumber ? a : b
	);

	const restoreRes = await fetch(
		`${liveBase}/api/documents/${docId}/versions/${oldest.versionNumber}/restore`,
		{
			method: 'POST',
			headers: {
				origin: liveBase,
				cookie: staffCookie,
				'content-type': 'application/json'
			},
			body: '{}'
		}
	);
	assert.equal(restoreRes.status, 200, 'restore version');
	const restored = await restoreRes.json();
	const restoredTitle = restored.data?.title ?? restored.data?.draftData?.title;
	assert.equal(restoredTitle, titleV1, 'title rolled back to v1');

	const delRes = await fetch(`${liveBase}/api/documents/${docId}`, {
		method: 'DELETE',
		headers: { origin: liveBase, cookie: staffCookie }
	});
	assert.equal(delRes.status, 200, 'delete disposable doc');

	return {
		ok: true,
		slug,
		documentId: docId,
		restoredVersion: oldest.versionNumber,
		restoredTitle
	};
}

export async function sampleLiveRssKb() {
	const fromEnv = process.env.LAB_NOTES_LIVE_PID;
	let pid = fromEnv ? Number(fromEnv) : NaN;
	if (!pid) {
		const lsof = spawnSync('lsof', ['-nP', '-iTCP:5192', '-sTCP:LISTEN', '-t'], {
			encoding: 'utf8'
		});
		pid = Number((lsof.stdout || '').trim().split('\n')[0]);
	}
	if (!pid) return { pid: null, rssKb: null };
	const ps = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' });
	const rssKb = Number((ps.stdout || '').trim());
	return { pid, rssKb: Number.isFinite(rssKb) ? rssKb : null };
}

async function main() {
	const cmd = process.argv[2] ?? 'drill';
	let snapshotDir = process.argv[3];

	if (cmd === 'backup') {
		const dir = await runBackup();
		console.log(JSON.stringify({ ok: true, snapshotDir: dir }));
		return;
	}

	if (cmd === 'restore-proof') {
		snapshotDir = snapshotDir ?? (await latestSnapshot());
		const proof = await runRestoreProof(snapshotDir);
		console.log(
			JSON.stringify({
				ok: true,
				snapshotDir,
				restoreRoot: proof.restoreRoot,
				status: { post: proof.post, media: proof.media }
			})
		);
		return;
	}

	if (cmd === 'rollback-proof') {
		const result = await runRollbackProof();
		console.log(JSON.stringify(result));
		return;
	}

	if (cmd === 'rss') {
		const sample = await sampleLiveRssKb();
		console.log(JSON.stringify({ ok: true, ...sample }));
		return;
	}

	if (cmd === 'drill') {
		snapshotDir = await runBackup();
		const proof = await runRestoreProof(snapshotDir);
		let rollback = null;
		let rollbackError = null;
		try {
			rollback = await runRollbackProof();
		} catch (e) {
			rollbackError = e instanceof Error ? e.message : String(e);
		}
		const rss = await sampleLiveRssKb();
		console.log(
			JSON.stringify({
				ok: !rollbackError,
				snapshotDir,
				restoreProof: { post: proof.post, media: proof.media },
				rollback: rollback ?? { error: rollbackError },
				rssSample: rss
			})
		);
		if (rollbackError) process.exit(1);
		return;
	}

	console.error(`Usage: node backup-restore.mjs <backup|restore-proof|rollback-proof|rss|drill> [snapshotDir]`);
	process.exit(2);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
