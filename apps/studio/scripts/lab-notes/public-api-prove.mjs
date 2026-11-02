#!/usr/bin/env node
/**
 * Published public API proof (React site reads).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.join(__dirname, '../..');
const base = process.env.LAB_NOTES_BASE ?? 'http://127.0.0.1:5192';
const dataRoot =
	process.env.LAB_NOTES_DATA_DIR ?? path.join(studioRoot, '.aphex/lab-notes-eval');

async function main() {
	const publishedSlug = 'swapping-the-engine-is-the-easy-part';

	const pubRes = await fetch(`${base}/api/lab-notes/public/blog-posts/${publishedSlug}`);
	assert.equal(pubRes.status, 200, 'published slug without token');
	const pubBody = await pubRes.json();
	assert.equal(pubBody.success, true);
	assert.equal(pubBody.data.slug, publishedSlug);
	assert.ok(Array.isArray(pubBody.data.content), 'published content array');
	assert.ok(typeof pubBody.data.updatedAt === 'string', 'detail updatedAt');
	assert.ok(typeof pubBody.data.readingTimeMinutes === 'number', 'detail readingTimeMinutes');
	assert.ok(
		typeof pubBody.data.adminEditPath === 'string' && pubBody.data.adminEditPath.includes('/admin?'),
		'adminEditPath'
	);

	const badPreview = await fetch(
		`${base}/api/lab-notes/public/blog-posts/${publishedSlug}?preview=not-a-valid-token`
	);
	assert.equal(badPreview.status, 401, 'bad preview on published slug');
	const badText = await badPreview.text();
	assert.ok(!badText.includes('"content"'), 'bad preview must not leak JSON body');

	const manifest = JSON.parse(
		await readFile(path.join(dataRoot, 'import-manifest.json'), 'utf8')
	);
	const expectedCount = manifest.sourcePostCount ?? manifest.posts.length;

	const listRes = await fetch(`${base}/api/lab-notes/public/blog-posts`);
	assert.equal(listRes.status, 200, 'archive list');
	const listBody = await listRes.json();
	assert.equal(listBody.success, true);
	assert.ok(Array.isArray(listBody.data), 'archive array');
	assert.equal(listBody.data.length, expectedCount, 'archive matches imported posts');
	const first = listBody.data[0];
	assert.ok(first.slug && first.title, 'list item shape');
	assert.ok(Array.isArray(first.tags), 'list tags');
	assert.ok(typeof first.readingTimeMinutes === 'number', 'list readingTimeMinutes');
	assert.ok(typeof first.updatedAt === 'string', 'list updatedAt');
	if (first.coverImage?.url) {
		assert.match(String(first.coverImage.url), /^https?:\/\//, 'absolute cover url');
	}

	console.log(
		JSON.stringify({
			ok: true,
			endpoints: {
				publishedPost: 'GET /api/lab-notes/public/blog-posts/[slug]',
				archive: 'GET /api/lab-notes/public/blog-posts'
			},
			publishedSlug,
			archiveCount: listBody.data.length
		})
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
