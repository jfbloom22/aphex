#!/usr/bin/env node
/**
 * H2 proof: fetch Ghost export, import, edit one draft, re-import without clobbering.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runGhostImport } from './import-via-mcp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.join(__dirname, '../..');
const dataRoot =
	process.env.LAB_NOTES_DATA_DIR ?? path.join(studioRoot, '.aphex/lab-notes-eval');
const base = process.env.LAB_NOTES_BASE ?? 'http://127.0.0.1:5192';

async function mcp(apiKey, name, args) {
	const response = await fetch(`${base}/mcp`, {
		method: 'POST',
		headers: {
			'x-api-key': apiKey,
			accept: 'application/json, text/event-stream',
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: name,
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

function runNodeScript(scriptName) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [path.join(__dirname, scriptName)], {
			cwd: studioRoot,
			stdio: 'inherit',
			env: process.env
		});
		child.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${scriptName} exited ${code}`));
		});
	});
}

async function main() {
	await runNodeScript('fetch-ghost-export.mjs');
	const apiKey = (await readFile(path.join(dataRoot, 'mcp-api-key.txt'), 'utf8')).trim();

	const first = await runGhostImport({ apiKey, skipVisualLab: true });
	assert.equal(first.posts.length, first.sourcePostCount, 'first import accounts for all posts');

	const probeSlug = first.posts.find((p) => p.action !== 'skip_unchanged')?.slug ?? first.posts[0].slug;
	const before = await mcp(apiKey, 'query_documents', {
		collection: 'blog_post',
		where: { slug: { equals: probeSlug } },
		limit: 1,
		perspective: 'draft'
	});
	const doc = before.docs[0];
	assert.ok(doc?.id, 'probe document');
	const editedTitle = `${doc.title} [import-prove-edit]`;
	await mcp(apiKey, 'update_document', {
		collection: 'blog_post',
		id: doc.id,
		data: { title: editedTitle }
	});

	const second = await runGhostImport({ apiKey, skipVisualLab: true });
	const probeEntry = second.posts.find((p) => p.slug === probeSlug);
	assert.equal(probeEntry?.action, 'skip_local_edit', 're-import skips locally edited draft');

	const after = await mcp(apiKey, 'get_document', {
		collection: 'blog_post',
		id: doc.id,
		perspective: 'draft'
	});
	assert.equal(after.title, editedTitle, 'edited title preserved');

	console.log(
		JSON.stringify({
			ok: true,
			sourcePostCount: second.sourcePostCount,
			probeSlug,
			firstActions: first.actions,
			secondActions: second.actions
		})
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
