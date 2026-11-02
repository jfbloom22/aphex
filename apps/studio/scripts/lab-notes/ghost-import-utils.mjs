import { createHash } from 'node:crypto';

export const EXCLUDED_POST_SLUGS = new Set(['about', 'coming-soon']);
export const REQUIRED_TAG_SLUG = 'lab-notes';
export const EXCLUDED_TAG_SLUG = 'people-first';

/** @param {{ slug?: string; tags?: { slug?: string }[] }} post */
export function ghostPostInMigrationScope(post) {
	if (!post?.slug || EXCLUDED_POST_SLUGS.has(post.slug)) return false;
	const tagSlugs = (post.tags ?? []).map((t) => t.slug);
	if (!tagSlugs.includes(REQUIRED_TAG_SLUG)) return false;
	if (tagSlugs.includes(EXCLUDED_TAG_SLUG)) return false;
	return true;
}

/**
 * Stable hash of Ghost fields that drive the Aphex draft.
 * @param {Record<string, unknown>} post
 */
export function computeGhostContentHash(post) {
	const payload = {
		id: post.id ?? post.uuid,
		title: post.title ?? '',
		slug: post.slug ?? '',
		html: post.html ?? '',
		custom_excerpt: post.custom_excerpt ?? null,
		excerpt: post.excerpt ?? null,
		published_at: post.published_at ?? null,
		updated_at: post.updated_at ?? null,
		feature_image: post.feature_image ?? null,
		feature_image_alt: post.feature_image_alt ?? null,
		meta_title: post.meta_title ?? null,
		meta_description: post.meta_description ?? null,
		og_image: post.og_image ?? null,
		og_title: post.og_title ?? null,
		og_description: post.og_description ?? null,
		twitter_title: post.twitter_title ?? null,
		twitter_description: post.twitter_description ?? null,
		twitter_image: post.twitter_image ?? null,
		tags: (post.tags ?? [])
			.map((t) => ({ slug: t.slug, name: t.name }))
			.sort((a, b) => a.slug.localeCompare(b.slug)),
		authors: (post.authors ?? [])
			.map((a) => ({ slug: a.slug, name: a.name }))
			.sort((a, b) => a.slug.localeCompare(b.slug))
	};
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** @param {Record<string, unknown>} post */
export function ghostSeoFields(post) {
	/** @type {{ metaTitle?: string; metaDescription?: string; noIndex?: boolean }} */
	const seo = {};
	if (post.meta_title) seo.metaTitle = String(post.meta_title);
	if (post.meta_description) seo.metaDescription = String(post.meta_description);
	if (post.og_title && !seo.metaTitle) seo.metaTitle = String(post.og_title);
	if (post.og_description && !seo.metaDescription) seo.metaDescription = String(post.og_description);
	if (post.twitter_title && !seo.metaTitle) seo.metaTitle = String(post.twitter_title);
	if (post.twitter_description && !seo.metaDescription) {
		seo.metaDescription = String(post.twitter_description);
	}
	return Object.keys(seo).length ? seo : undefined;
}

/** @param {Record<string, unknown>} post */
export function ghostOgImageUrl(post) {
	const url = post.og_image ?? post.twitter_image ?? null;
	return url ? String(url) : undefined;
}

/** @param {Record<string, unknown>} post */
export function ghostPublishedAtIso(post) {
	const raw = post.published_at;
	if (!raw) return undefined;
	return String(raw);
}

/**
 * @param {string | undefined} iso
 */
export function ghostPostDateOnly(iso) {
	if (!iso) return undefined;
	return String(iso).slice(0, 10);
}

/**
 * @param {unknown} doc
 */
export function readImportSource(doc) {
	if (!doc || typeof doc !== 'object') return null;
	const src = /** @type {Record<string, unknown>} */ (doc).importSource;
	if (!src || typeof src !== 'object') return null;
	return /** @type {{ sourceSystem?: string; externalId?: string; contentHash?: string; revisionAtImport?: number; importedAt?: string }} */ (
		src
	);
}

/**
 * @param {unknown} doc
 */
export function readDocRevision(doc) {
	if (!doc || typeof doc !== 'object') return 0;
	const meta = /** @type {Record<string, unknown>} */ (doc)._meta;
	if (meta && typeof meta === 'object' && typeof meta.revision === 'number') {
		return meta.revision;
	}
	return 0;
}

/**
 * @param {unknown} existingDoc
 * @param {Record<string, unknown>} ghostPost
 */
export function hasLocalContentEdits(existingDoc, ghostPost) {
	if (!existingDoc || typeof existingDoc !== 'object') return false;
	const doc = /** @type {Record<string, unknown>} */ (existingDoc);
	if (String(doc.title ?? '') !== String(ghostPost.title ?? '')) return true;
	const ghostExcerpt = String(
		ghostPost.custom_excerpt ?? ghostPost.excerpt ?? ''
	);
	if (String(doc.excerpt ?? '') !== ghostExcerpt) return true;
	return false;
}

/**
 * @param {unknown} existingDoc
 * @param {string} newHash
 * @param {Record<string, unknown>} ghostPost
 * @returns {'skip_unchanged' | 'skip_local_edit' | 'apply' | 'refresh_baseline'}
 */
export function decideImportAction(existingDoc, newHash, ghostPost) {
	if (!existingDoc) return 'apply';
	if (hasLocalContentEdits(existingDoc, ghostPost)) {
		return 'skip_local_edit';
	}
	const src = readImportSource(existingDoc);
	if (!src?.contentHash) return 'apply';
	const revision = readDocRevision(existingDoc);
	if (src.contentHash === newHash) {
		if (
			src?.revisionAtImport != null &&
			typeof src.revisionAtImport === 'number' &&
			revision > src.revisionAtImport
		) {
			return 'refresh_baseline';
		}
		return 'skip_unchanged';
	}
	return 'apply';
}
