import type { BlogPost } from '$lib/generated-types';
import type { AuthorInfo } from '$lib/blog/authors';
import type { TagInfo } from '$lib/blog/tags';
import { appendPreviewToMediaUrls } from './preview-media-access';

export type PublicBlogPostPayload = {
	id: string;
	slug: string;
	title: string;
	excerpt?: string;
	content: BlogPost['content'];
	coverImage?: BlogPost['coverImage'];
	importSource?: BlogPost['importSource'];
	seo?:
		| {
				metaTitle?: string;
				metaDescription?: string;
				ogImage?: string;
				noIndex?: boolean;
		  }
		| undefined;
	author: AuthorInfo | null;
	coAuthors: AuthorInfo[];
	tags: TagInfo[];
	sourcePublishedAt: string | null;
};

export function buildPublicBlogPostPayload(
	post: BlogPost,
	author: AuthorInfo | null,
	coAuthors: AuthorInfo[],
	tags: TagInfo[]
): PublicBlogPostPayload {
	return {
		id: post.id,
		slug: post.slug,
		title: post.title,
		excerpt: post.excerpt,
		content: post.content,
		coverImage: post.coverImage,
		importSource: post.importSource,
		seo: post.seo
			? {
					metaTitle: post.seo.metaTitle,
					metaDescription: post.seo.metaDescription,
					ogImage: post.seo.ogImage,
					noIndex: post.seo.noIndex
				}
			: undefined,
		author,
		coAuthors,
		tags,
		sourcePublishedAt: post.importSource?.sourcePublishedAt ?? null
	};
}

/** Turn injected `/media/…` paths into absolute URLs for cross-origin React clients. */
export function toAbsoluteMediaUrls(value: unknown, origin: string): unknown {
	const base = origin.replace(/\/$/, '');
	if (typeof value === 'string' && value.startsWith('/media/')) {
		return `${base}${value}`;
	}
	if (Array.isArray(value)) {
		return value.map((v) => toAbsoluteMediaUrls(v, origin));
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = toAbsoluteMediaUrls(v, origin);
		}
		return out;
	}
	return value;
}

export function finalizePublicBlogPostPayload(
	payload: PublicBlogPostPayload,
	opts: { previewToken?: string; mediaOrigin?: string }
): PublicBlogPostPayload {
	let data = payload;
	if (opts.previewToken) {
		data = appendPreviewToMediaUrls(payload, opts.previewToken) as PublicBlogPostPayload;
	}
	if (opts.mediaOrigin) {
		data = toAbsoluteMediaUrls(data, opts.mediaOrigin) as PublicBlogPostPayload;
	}
	return data;
}

export type PublicBlogPostListItem = {
	slug: string;
	title: string;
	excerpt?: string;
	coverImage?: BlogPost['coverImage'];
	tags: Pick<TagInfo, 'slug' | 'title'>[];
	postDate?: string;
	sourcePublishedAt: string | null;
};

export function buildPublicBlogPostListItem(
	post: BlogPost,
	tags: TagInfo[],
	mediaOrigin: string
): PublicBlogPostListItem {
	const item: PublicBlogPostListItem = {
		slug: post.slug,
		title: post.title,
		excerpt: post.excerpt,
		coverImage: post.coverImage,
		tags: tags.map(({ slug, title }) => ({ slug, title })),
		postDate: post.postDate,
		sourcePublishedAt: post.importSource?.sourcePublishedAt ?? null
	};
	return toAbsoluteMediaUrls(item, mediaOrigin) as PublicBlogPostListItem;
}

const REQUIRED_TAG = 'lab-notes';
const EXCLUDED_TAG = 'people-first';

/** Same scope as Ghost import + Svelte archive (lab-notes tag, not people-first). */
export function postInLabNotesPublicArchive(
	post: BlogPost,
	tagMap: Record<string, TagInfo>
): boolean {
	const refs = post.tags ?? [];
	let hasLabNotes = false;
	let hasPeopleFirst = false;
	for (const ref of refs) {
		const id = typeof ref === 'string' ? ref : ref._ref;
		const tag = id ? tagMap[id] : undefined;
		if (tag?.slug === REQUIRED_TAG) hasLabNotes = true;
		if (tag?.slug === EXCLUDED_TAG) hasPeopleFirst = true;
	}
	return hasLabNotes && !hasPeopleFirst;
}
