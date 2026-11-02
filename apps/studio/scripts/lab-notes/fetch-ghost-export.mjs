#!/usr/bin/env node
/**
 * Pull published Ghost Content API posts for Lab Notes migration scope.
 * Credentials: GHOST_URL + GHOST_CONTENT_API_KEY from workplace-labs-web/.env (never logged).
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGhostContentApiConfig } from './ghost-env.mjs';
import {
	EXCLUDED_POST_SLUGS,
	ghostPostInMigrationScope
} from './ghost-import-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.join(__dirname, '../..');
const dataRoot =
	process.env.LAB_NOTES_DATA_DIR ?? path.join(studioRoot, '.aphex/lab-notes-eval');

/**
 * @param {string} baseUrl
 * @param {string} key
 * @param {number} page
 */
async function fetchPostsPage(baseUrl, key, page) {
	const params = new URLSearchParams({
		key,
		limit: '100',
		page: String(page),
		include: 'tags,authors',
		formats: 'html'
	});
	const url = `${baseUrl}/ghost/api/content/posts/?${params}`;
	const response = await fetch(url, { headers: { accept: 'application/json' } });
	if (!response.ok) {
		throw new Error(`Ghost Content API HTTP ${response.status}`);
	}
	return /** @type {{ posts?: unknown[]; meta?: { pagination?: { pages?: number; page?: number } } }} */ (
		await response.json()
	);
}

async function main() {
	const { url, key } = await loadGhostContentApiConfig();
	const allPosts = [];
	let page = 1;
	let totalPages = 1;
	while (page <= totalPages) {
		const body = await fetchPostsPage(url, key, page);
		const posts = body.posts ?? [];
		allPosts.push(...posts);
		totalPages = body.meta?.pagination?.pages ?? 1;
		page += 1;
	}

	const inScope = allPosts.filter((p) => ghostPostInMigrationScope(/** @type {any} */ (p)));
	const excludedBySlug = allPosts.filter(
		(p) => EXCLUDED_POST_SLUGS.has(/** @type {any} */ (p).slug)
	);

	await mkdir(dataRoot, { recursive: true });
	const exportPath = path.join(dataRoot, 'ghost-content-export.json');
	const bundle = {
		exportedAt: new Date().toISOString(),
		source: 'ghost-content-api',
		ghostUrlHost: new URL(url).host,
		filters: {
			requiredTag: 'lab-notes',
			excludedTag: 'people-first',
			excludedSlugs: [...EXCLUDED_POST_SLUGS]
		},
		rawPostCount: allPosts.length,
		migrationPostCount: inScope.length,
		posts: inScope
	};
	await writeFile(exportPath, JSON.stringify(bundle, null, 2));

	console.log(
		JSON.stringify({
			ok: true,
			exportPath,
			rawPostCount: allPosts.length,
			migrationPostCount: inScope.length,
			excludedDefaultPages: excludedBySlug.map((p) => /** @type {any} */ (p).slug)
		})
	);
}

main().catch((e) => {
	console.error(e.message ?? e);
	process.exit(1);
});
