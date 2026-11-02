#!/usr/bin/env node
/**
 * Import Ghost export → Aphex blog_post via MCP (idempotent, provenance, review failures).
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ghostHtmlToPortableText, visualLabDraftPortableText } from './html-to-content.mjs';
import {
	computeGhostContentHash,
	decideImportAction,
	ghostOgImageUrl,
	ghostPostDateOnly,
	ghostPublishedAtIso,
	ghostSeoFields,
	readDocRevision,
	readImportSource
} from './ghost-import-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.join(__dirname, '../..');
const base = process.env.LAB_NOTES_BASE ?? 'http://127.0.0.1:5192';
const dataRoot = process.env.LAB_NOTES_DATA_DIR ?? path.join(studioRoot, '.aphex/lab-notes-eval');
const defaultExport = path.join(dataRoot, 'ghost-content-export.json');

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
	if (payload.result.isError || inner.success === false) throw new Error(inner.error ?? 'tool error');
	return inner.data ?? inner;
}

async function findCoverFile(mediaRoot, slug) {
	if (!mediaRoot) return null;
	const dir = path.join(mediaRoot, slug);
	try {
		const files = await readdir(dir);
		const cover = files.find((f) => f.startsWith('cover.'));
		if (cover) return path.join(dir, cover);
	} catch {
		/* missing dir */
	}
	return null;
}

async function uploadCover(apiKey, mediaRoot, slug, alt, remoteUrl) {
	const filePath = await findCoverFile(mediaRoot, slug);
	const responseFromAsset = async (buffer, filename, mimeType) => {
		const form = new FormData();
		form.append('file', new Blob([buffer], { type: mimeType }), filename);
		if (alt) form.append('alt', alt);
		const response = await fetch(`${base}/api/assets`, {
			method: 'POST',
			headers: { 'x-api-key': apiKey, origin: base },
			body: form
		});
		if (response.status === 200) {
			const payload = JSON.parse(await response.text());
			const assetId = payload.data?.id;
			if (assetId) {
				return {
					_type: 'image',
					asset: { _type: 'reference', _ref: assetId },
					alt: alt ?? ''
				};
			}
		}
		return null;
	};

	if (filePath) {
		const buf = await readFile(filePath);
		const ext = path.extname(filePath);
		const filename = `cover${ext}`;
		const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
		const viaHttp = await responseFromAsset(buf, filename, mimeType);
		if (viaHttp) return viaHttp;
	}

	if (remoteUrl) {
		const uploaded = await mcp(apiKey, 'upload_asset', {
			url: remoteUrl,
			filename: 'cover.png',
			alt: alt ?? ''
		});
		if (uploaded.imageValue) {
			return { ...uploaded.imageValue, alt: alt ?? '' };
		}
		if (uploaded.error) {
			throw new Error(`cover ${slug}: ${uploaded.error}`);
		}
	}

	return undefined;
}

async function uploadSeoOgImage(apiKey, url, alt) {
	if (!url) return undefined;
	const uploaded = await mcp(apiKey, 'upload_asset', {
		url,
		filename: 'og.png',
		alt: alt ?? ''
	});
	return uploaded.imageValue ? { ...uploaded.imageValue, alt: alt ?? '' } : undefined;
}

async function ensureVisualLabDraft(apiKey, tagIds, authorIds) {
	const slug = 'native-svelte-visual-lab';
	const found = await mcp(apiKey, 'query_documents', {
		collection: 'blog_post',
		where: { slug: { equals: slug } },
		limit: 1,
		perspective: 'draft'
	});
	const content = visualLabDraftPortableText();
	await ensureTag(apiKey, tagIds, 'lab-notes', 'Lab Notes');
	await ensureTag(apiKey, tagIds, 'building-with-ai', 'Building with AI');
	const authorId = await ensureAuthor(apiKey, authorIds, 'Workplace Labs', 'workplace-labs');
	const data = {
		title: 'Native Svelte visual lab',
		slug,
		excerpt:
			'A private local experiment with native Svelte interactivity and a static HTML embed.',
		postDate: '2026-01-15',
		author: { _type: 'reference', _ref: authorId },
		tags: [
			{ _type: 'reference', _ref: tagIds.get('lab-notes') },
			{ _type: 'reference', _ref: tagIds.get('building-with-ai') }
		],
		content
	};
	if (found.docs?.[0]?.id) {
		await mcp(apiKey, 'update_document', {
			collection: 'blog_post',
			id: found.docs[0].id,
			data
		});
		return;
	}
	await mcp(apiKey, 'create_document', { collection: 'blog_post', data, publish: false });
}

async function ensureTag(apiKey, tagIds, slug, title) {
	if (tagIds.has(slug)) return tagIds.get(slug);
	const found = await mcp(apiKey, 'query_documents', {
		collection: 'tag',
		where: { slug: { equals: slug } },
		limit: 1
	});
	const id = found.docs?.[0]?.id;
	if (id) {
		tagIds.set(slug, id);
		return id;
	}
	const created = await mcp(apiKey, 'create_document', {
		collection: 'tag',
		data: { title, slug },
		publish: true
	});
	const newId = created.document?.id ?? created.id;
	tagIds.set(slug, newId);
	return newId;
}

async function ensureAuthor(apiKey, authorIds, name, slug) {
	if (authorIds.has(slug)) return authorIds.get(slug);
	const found = await mcp(apiKey, 'query_documents', {
		collection: 'author',
		where: { slug: { equals: slug } },
		limit: 1
	});
	const id = found.docs?.[0]?.id;
	if (id) {
		authorIds.set(slug, id);
		return id;
	}
	const created = await mcp(apiKey, 'create_document', {
		collection: 'author',
		data: { name, slug, bio: '' },
		publish: true
	});
	const newId = created.document?.id ?? created.id;
	authorIds.set(slug, newId);
	return newId;
}

/**
 * @param {Record<string, unknown>} post
 */
async function resolveAuthors(apiKey, authorIds, post) {
	const authors = /** @type {{ name?: string; slug?: string }[]} */ (post.authors ?? []);
	if (!authors.length) {
		const id = await ensureAuthor(apiKey, authorIds, 'Unknown', 'unknown');
		return { authorId: id, coAuthorIds: [] };
	}
	const ids = [];
	for (const a of authors) {
		const name = a.name ?? 'Unknown';
		const slug = a.slug ?? name.toLowerCase().replace(/\s+/g, '-');
		ids.push(await ensureAuthor(apiKey, authorIds, name, slug));
	}
	return { authorId: ids[0], coAuthorIds: ids.slice(1) };
}

/**
 * @param {Record<string, unknown>} post
 * @param {unknown} existingDoc
 */
async function buildPostData(apiKey, mediaRoot, tagIds, authorIds, post, existingDoc) {
	const contentHash = computeGhostContentHash(post);
	const {
		blocks: content,
		runPromptCount,
		reviewFailures
	} = ghostHtmlToPortableText(String(post.html ?? ''));
	for (const t of /** @type {{ slug: string; name?: string }[]} */ (post.tags ?? [])) {
		await ensureTag(apiKey, tagIds, t.slug, t.name ?? t.slug);
	}
	const tagRefs = (post.tags ?? []).map((t) => ({
		_type: 'reference',
		_ref: tagIds.get(/** @type {{ slug: string }} */ (t).slug)
	}));
	const { authorId, coAuthorIds } = await resolveAuthors(apiKey, authorIds, post);
	const coverImage = await uploadCover(
		apiKey,
		mediaRoot,
		String(post.slug),
		String(post.feature_image_alt ?? post.title ?? ''),
		post.feature_image ? String(post.feature_image) : undefined
	);
	const publishedAt = ghostPublishedAtIso(post);
	const seoBase = ghostSeoFields(post) ?? {};
	const ogUrl = ghostOgImageUrl(post);
	const ogImage =
		ogUrl && ogUrl !== post.feature_image
			? await uploadSeoOgImage(apiKey, ogUrl, String(post.feature_image_alt ?? post.title ?? ''))
			: undefined;
	const seo = {
		...seoBase,
		...(ogImage ? { ogImage } : {})
	};
	const externalId = String(post.id ?? post.uuid ?? post.slug);
	const importedAt = new Date().toISOString();

	/** @type {Record<string, unknown>} */
	const data = {
		title: post.title,
		slug: post.slug,
		excerpt: post.custom_excerpt ?? post.excerpt ?? '',
		postDate: ghostPostDateOnly(publishedAt),
		author: { _type: 'reference', _ref: authorId },
		...(coAuthorIds.length
			? {
					coAuthors: coAuthorIds.map((id) => ({ _type: 'reference', _ref: id }))
				}
			: {}),
		tags: tagRefs,
		content,
		importSource: {
			sourceSystem: 'ghost',
			externalId,
			contentHash,
			importedAt,
			...(publishedAt ? { sourcePublishedAt: publishedAt } : {})
		},
		importReview: { failures: reviewFailures },
		...(Object.keys(seo).length ? { seo } : {}),
		...(coverImage ? { coverImage } : {})
	};
	return { data, contentHash, runPromptCount, reviewFailures, coverImage, externalId };
}

async function applyImport(apiKey, data, existingId) {
	let id = existingId;
	if (existingId) {
		await mcp(apiKey, 'update_document', {
			collection: 'blog_post',
			id: existingId,
			data
		});
		await mcp(apiKey, 'publish_document', { collection: 'blog_post', id: existingId });
	} else {
		const created = await mcp(apiKey, 'create_document', {
			collection: 'blog_post',
			data,
			publish: true
		});
		id = created.document?.id ?? created.id;
	}
	let doc = await mcp(apiKey, 'get_document', {
		collection: 'blog_post',
		id,
		perspective: 'draft'
	});
	let revision = readDocRevision(doc);
	const importSource = {
		...(typeof data.importSource === 'object' ? data.importSource : {}),
		revisionAtImport: revision
	};
	await mcp(apiKey, 'update_document', {
		collection: 'blog_post',
		id,
		data: { importSource }
	});
	doc = await mcp(apiKey, 'get_document', {
		collection: 'blog_post',
		id,
		perspective: 'draft'
	});
	revision = readDocRevision(doc);
	if (importSource.revisionAtImport !== revision) {
		await mcp(apiKey, 'update_document', {
			collection: 'blog_post',
			id,
			data: { importSource: { ...importSource, revisionAtImport: revision } }
		});
	}
	return { action: existingId ? 'updated' : 'created', revision, id };
}

export async function runGhostImport(options = {}) {
	const apiKey =
		options.apiKey ??
		(await readFile(path.join(dataRoot, 'mcp-api-key.txt'), 'utf8')).trim();
	const exportPath = options.exportPath ?? process.argv[2] ?? defaultExport;
	const mediaRoot = options.mediaRoot ?? process.env.LAB_NOTES_MEDIA_DIR ?? null;
	const bundle = JSON.parse(await readFile(exportPath, 'utf8'));
	const posts = bundle.posts ?? [];
	const sourcePostCount = bundle.migrationPostCount ?? posts.length;

	if (posts.length !== sourcePostCount) {
		throw new Error(
			`Export post count mismatch: posts=${posts.length} migrationPostCount=${sourcePostCount}`
		);
	}

	const tagIds = new Map();
	const authorIds = new Map();
	const manifest = {
		importedAt: new Date().toISOString(),
		exportPath,
		sourcePostCount,
		converter: '@portabletext/html',
		posts: [],
		totalRunPrompts: 0,
		coverPaths: [],
		actions: { created: 0, updated: 0, skip_unchanged: 0, skip_local_edit: 0 },
		reviewFailureCount: 0
	};

	for (const post of posts) {
		const existing = await mcp(apiKey, 'query_documents', {
			collection: 'blog_post',
			where: { slug: { equals: post.slug } },
			limit: 1,
			perspective: 'draft'
		});
		const existingDoc = existing.docs?.[0] ?? null;
		const contentHash = computeGhostContentHash(post);
		const decision = decideImportAction(existingDoc, contentHash, post);

		const recordSkipped = (action, doc = existingDoc) => {
			const hasCover = Boolean(doc?.coverImage);
			if (hasCover) manifest.coverPaths.push(post.slug);
			const runPromptCount =
				(doc?.content && Array.isArray(doc.content)
					? doc.content.filter((b) => b?._type === 'runPrompt').length
					: 0) ?? 0;
			manifest.posts.push({
				slug: post.slug,
				action,
				externalId: post.id ?? post.uuid,
				contentHash,
				runPromptCount,
				hasCover,
				reviewFailures: doc?.importReview?.failures ?? []
			});
			manifest.totalRunPrompts += runPromptCount;
			manifest.reviewFailureCount += (doc?.importReview?.failures ?? []).length;
		};

		if (decision === 'refresh_baseline') {
			const doc = await mcp(apiKey, 'get_document', {
				collection: 'blog_post',
				id: existingDoc.id,
				perspective: 'draft'
			});
			const revision = readDocRevision(doc);
			await mcp(apiKey, 'update_document', {
				collection: 'blog_post',
				id: existingDoc.id,
				data: {
					importSource: {
						...readImportSource(existingDoc),
						contentHash,
						revisionAtImport: revision,
						importedAt: new Date().toISOString()
					}
				}
			});
			manifest.actions.skip_unchanged += 1;
			recordSkipped('skip_unchanged', doc);
			continue;
		}

		if (decision === 'skip_unchanged') {
			manifest.actions.skip_unchanged += 1;
			recordSkipped('skip_unchanged');
			continue;
		}

		if (decision === 'skip_local_edit') {
			manifest.actions.skip_local_edit += 1;
			recordSkipped('skip_local_edit');
			continue;
		}

		const built = await buildPostData(
			apiKey,
			mediaRoot,
			tagIds,
			authorIds,
			post,
			existingDoc
		);
		const result = await applyImport(apiKey, built.data, existingDoc?.id);
		manifest.actions[result.action === 'created' ? 'created' : 'updated'] += 1;
		manifest.posts.push({
			slug: post.slug,
			action: result.action,
			externalId: built.externalId,
			contentHash: built.contentHash,
			runPromptCount: built.runPromptCount,
			hasCover: Boolean(built.coverImage),
			reviewFailures: built.reviewFailures
		});
		manifest.totalRunPrompts += built.runPromptCount;
		manifest.reviewFailureCount += built.reviewFailures.length;
		if (built.coverImage) manifest.coverPaths.push(post.slug);
	}

	if (!options.skipVisualLab) {
		await ensureVisualLabDraft(apiKey, tagIds, authorIds);
	}

	if (manifest.posts.length !== sourcePostCount) {
		throw new Error(`Manifest missing posts: ${manifest.posts.length} !== ${sourcePostCount}`);
	}

	await mkdir(dataRoot, { recursive: true });
	await writeFile(path.join(dataRoot, 'import-manifest.json'), JSON.stringify(manifest, null, 2));

	return manifest;
}

async function main() {
	const manifest = await runGhostImport();
	console.log(
		JSON.stringify({
			ok: true,
			sourcePostCount: manifest.sourcePostCount,
			posts: manifest.posts.length,
			covers: manifest.coverPaths.length,
			runPrompts: manifest.totalRunPrompts,
			actions: manifest.actions,
			reviewFailureCount: manifest.reviewFailureCount
		})
	);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
