#!/usr/bin/env node
/**
 * H3 proof: preview token mint, public draft read, reject bad/expired token, published unchanged.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.join(__dirname, '../..');
const base = process.env.LAB_NOTES_BASE ?? 'http://127.0.0.1:5192';
const dataRoot =
	process.env.LAB_NOTES_DATA_DIR ?? path.join(studioRoot, '.aphex/lab-notes-eval');

async function readMcpKey() {
	return (await readFile(path.join(dataRoot, 'mcp-api-key.txt'), 'utf8')).trim();
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
			id: `prove-${name}-${Date.now()}`,
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

async function expireTokenInStore(token) {
	const storePath = path.join(dataRoot, 'preview-tokens.json');
	const store = JSON.parse(await readFile(storePath, 'utf8'));
	for (const row of store.tokens) {
		if (row.token === token) row.expiresAt = new Date(Date.now() - 60_000).toISOString();
	}
	await writeFile(storePath, JSON.stringify(store, null, 2));
}

function firstMediaUrl(value) {
	if (typeof value === 'string' && value.startsWith('/media/')) return value;
	if (Array.isArray(value)) {
		for (const v of value) {
			const found = firstMediaUrl(v);
			if (found) return found;
		}
	}
	if (value && typeof value === 'object') {
		for (const v of Object.values(value)) {
			const found = firstMediaUrl(v);
			if (found) return found;
		}
	}
	return null;
}

async function main() {
	const apiKey = await readMcpKey();

	const publishedSlug = 'swapping-the-engine-is-the-easy-part';
	const draftSlug = 'native-svelte-visual-lab';

	assert.equal((await fetch(`${base}/blog/${publishedSlug}`)).status, 200, 'published page');

	const minted = await mcp(apiKey, 'mint_preview_token', { slug: draftSlug });
	const { token, viewUrl } = minted;
	assert.ok(token && viewUrl, 'mint_preview_token payload');
	assert.match(viewUrl, /\/blog\/native-svelte-visual-lab\/\?preview=/);

	const draftRes = await fetch(
		`${base}/api/lab-notes/public/blog-posts/${draftSlug}?preview=${encodeURIComponent(token)}`
	);
	assert.equal(draftRes.status, 200, 'public draft read');
	const draftBody = await draftRes.json();
	assert.equal(draftBody.success, true);
	assert.ok(Array.isArray(draftBody.data.content), 'portable text content');
	assert.ok(draftBody.data.sourcePublishedAt !== undefined, 'sourcePublishedAt field');

	const noToken = await fetch(`${base}/api/lab-notes/public/blog-posts/${draftSlug}`);
	assert.equal(noToken.status, 404, 'unpublished draft without token');

	const badToken = await fetch(
		`${base}/api/lab-notes/public/blog-posts/${draftSlug}?preview=not-a-valid-token`
	);
	assert.equal(badToken.status, 401, 'bad token rejected');

	await expireTokenInStore(token);
	const expired = await fetch(
		`${base}/api/lab-notes/public/blog-posts/${draftSlug}?preview=${encodeURIComponent(token)}`
	);
	assert.equal(expired.status, 401, 'expired token rejected');

	const mint2 = await mcp(apiKey, 'mint_preview_token', { slug: draftSlug });
	const token2 = mint2.token;
	const draft2 = await fetch(
		`${base}/api/lab-notes/public/blog-posts/${draftSlug}?preview=${encodeURIComponent(token2)}`
	).then((r) => r.json());
	const coverUrl = firstMediaUrl(draft2.data);
	if (coverUrl) {
		const bareMedia = await fetch(`${base}${coverUrl.split('?')[0]}`);
		assert.equal(bareMedia.status, 401, 'draft media without preview token');
		const signedMedia = await fetch(`${base}${coverUrl}`);
		assert.equal(signedMedia.status, 200, 'draft media with preview on url');
	}

	const pubPage = await fetch(`${base}/blog/${publishedSlug}`);
	assert.equal(pubPage.status, 200);
	const pubHtml = await pubPage.text();
	const pubCover = pubHtml.match(/src="(\/media\/[^"]+)"/);
	assert.ok(pubCover, 'published cover in html');
	assert.equal((await fetch(`${base}${pubCover[1]}`)).status, 200, 'published media without token');

	console.log(
		JSON.stringify({
			ok: true,
			endpoints: {
				mint: 'POST /api/lab-notes/preview-token',
				mintMcp: 'mint_preview_token',
				publicDraft: 'GET /api/lab-notes/public/blog-posts/[slug]?preview='
			},
			draftMediaChecked: Boolean(coverUrl),
			viewUrlPattern: 'https://www.workplacelabs.io/blog/<slug>/?preview=<token>'
		})
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
