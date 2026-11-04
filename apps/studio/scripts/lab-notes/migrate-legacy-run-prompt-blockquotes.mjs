#!/usr/bin/env node
/**
 * Replace Ghost-era instructional Portable Text blockquotes with native runPrompt blocks.
 * Uses MCP (requires mcp-api-key.txt from provision-import-key.mjs).
 *
 *   LAB_NOTES_BASE=https://www.workplacelabs.io \
 *   LAB_NOTES_DATA_DIR=/tmp/lab-notes-prod-import \
 *   node migrate-legacy-run-prompt-blockquotes.mjs [--slug swapping-the-engine-is-the-easy-part] [--dry-run]
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const base = (process.env.LAB_NOTES_BASE ?? 'https://www.workplacelabs.io').replace(/\/$/, '');
const dataRoot = process.env.LAB_NOTES_DATA_DIR ?? '/tmp/lab-notes-prod-import';
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slugArg = args.find((a) => !a.startsWith('--'));

function portableTextBlockPlainText(block) {
	if (!Array.isArray(block.children)) return '';
	return block.children.map((child) => (typeof child.text === 'string' ? child.text : '')).join('');
}

/** Keep in sync with workplace-labs-web legacy-blockquote-prompt.ts until migration completes. */
function isLegacyRunPromptBlockquote(text) {
	const normalized = text.trim();
	if (normalized.length < 40) return false;
	if (/\{\{[^}]+\}\}/.test(normalized) || /\[paste\]/i.test(normalized)) return true;
	if (
		normalized.length >= 60 &&
		/\b(Write|Describe|Compare|Design|Turn these|Keep it under|Give it a title)\b/.test(normalized)
	) {
		return true;
	}
	return false;
}

function migrateContent(content) {
	if (!Array.isArray(content)) return { content, changed: 0 };
	let changed = 0;
	const next = content.map((block) => {
		if (block?._type !== 'block' || block.style !== 'blockquote') return block;
		const text = portableTextBlockPlainText(block);
		if (!isLegacyRunPromptBlockquote(text)) return block;
		changed += 1;
		return {
			_type: 'runPrompt',
			_key: block._key ?? `runPrompt-${changed}`,
			prompt: text,
			label: 'Try this prompt'
		};
	});
	return { content: next, changed };
}

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

async function main() {
	const keyFile = path.join(dataRoot, 'mcp-api-key.txt');
	const apiKey = (await readFile(keyFile, 'utf8')).trim();

	const where = slugArg ? { slug: { equals: slugArg } } : {};
	const found = await mcp(apiKey, 'query_documents', {
		collection: 'blog_post',
		where,
		limit: slugArg ? 1 : 200,
		perspective: 'published'
	});
	const docs = found.docs ?? [];
	if (docs.length === 0) throw new Error(slugArg ? `blog_post slug ${slugArg} not found` : 'no blog posts');

	let postsUpdated = 0;
	let blocksMigrated = 0;

	for (const doc of docs) {
		const content = doc.content;
		const { content: migrated, changed } = migrateContent(content);
		if (changed === 0) continue;
		postsUpdated += 1;
		blocksMigrated += changed;
		const slug = doc.slug ?? doc.id;
		if (dryRun) {
			console.log(JSON.stringify({ dryRun: true, slug, blocksMigrated: changed }));
			continue;
		}
		await mcp(apiKey, 'update_document', {
			collection: 'blog_post',
			id: doc.id,
			data: { content: migrated },
			publish: true
		});
		console.log(JSON.stringify({ ok: true, slug, blocksMigrated: changed }));
	}

	console.log(JSON.stringify({ ok: true, dryRun, postsUpdated, blocksMigrated, scanned: docs.length }));
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
