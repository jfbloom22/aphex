#!/usr/bin/env node
/**
 * Update a published author profile via MCP (role, optional userId link, avatar URL).
 * Requires LAB_NOTES_DATA_DIR/mcp-api-key.txt from provision-import-key.mjs.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const base = (process.env.LAB_NOTES_BASE ?? 'https://www.workplacelabs.io').replace(/\/$/, '');
const dataRoot = process.env.LAB_NOTES_DATA_DIR ?? '/tmp/lab-notes-prod-import';
const authorSlug = process.env.LAB_NOTES_AUTHOR_SLUG ?? 'jonathan';
const role = process.env.LAB_NOTES_AUTHOR_ROLE ?? 'Co-Founder';
const avatarUrl =
	process.env.LAB_NOTES_AUTHOR_AVATAR_URL ?? 'https://www.workplacelabs.io/images/jonathan-square.webp';
const linkUserId = process.env.LAB_NOTES_AUTHOR_USER_ID?.trim() || '';

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
	if (response.status !== 200) throw new Error(`${name} HTTP ${response.status}`);
	const text = await response.text();
	const line = text.split('\n').find((l) => l.startsWith('data: '));
	const payload = JSON.parse(line.slice(6));
	if (payload.error) throw new Error(JSON.stringify(payload.error));
	const inner = JSON.parse(payload.result.content[0].text);
	if (payload.result.isError || inner.success === false) {
		throw new Error(inner.error ?? JSON.stringify(inner));
	}
	return inner.data ?? inner;
}

function resultText(inner) {
	return typeof inner === 'string' ? inner : JSON.stringify(inner);
}

async function main() {
	const keyFile = path.join(dataRoot, 'mcp-api-key.txt');
	const apiKey = (await readFile(keyFile, 'utf8')).trim();

	const found = await mcp(apiKey, 'query_documents', {
		collection: 'author',
		where: { slug: { equals: authorSlug } },
		limit: 1,
		perspective: 'published'
	});
	const doc = found.docs?.[0];
	const id = doc?.id;
	if (!id) throw new Error(`author slug ${authorSlug} not found`);

	const uploaded = await mcp(apiKey, 'upload_asset', {
		url: avatarUrl,
		filename: 'jonathan-square.webp',
		alt: 'Jonathan Flower'
	});
	const avatar = uploaded.imageValue;
	if (!avatar) throw new Error('upload_asset did not return imageValue');

	const data = {
		role,
		avatar
	};
	if (linkUserId) data.userId = linkUserId;

	await mcp(apiKey, 'update_document', {
		collection: 'author',
		id,
		data,
		publish: true
	});

	console.log(JSON.stringify({ ok: true, authorSlug, id, role, linkedUser: Boolean(linkUserId) }));
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
