import type { BlogPost } from '$lib/generated-types';
import type { AuthorInfo } from '$lib/blog/authors';
import type { TagInfo } from '$lib/blog/tags';
import type { ImageValue } from '@aphexcms/cms-core/image';
import { readingTimeMinutes } from '$lib/blog/reading-time-minutes';
import { appendPreviewToMediaUrls } from './preview-media-access';

export type PublicAuthorAvatar = {
	url: string;
	alt?: string;
	srcSet?: string;
};

export type PublicAuthorDetail = {
	id: string;
	name: string;
	slug: string;
	role?: string;
	avatar?: PublicAuthorAvatar;
};

export type PublicAuthorListItem = {
	name: string;
	slug: string;
	role?: string;
};

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
	author: PublicAuthorDetail | null;
	coAuthors: PublicAuthorDetail[];
	tags: TagInfo[];
	sourcePublishedAt: string | null;
	postDate?: string;
	updatedAt: string;
	readingTimeMinutes: number;
	adminEditPath: string;
};

export function blogPostAdminEditPath(documentId: string): string {
	return `/admin?docType=blog_post&docId=${encodeURIComponent(documentId)}`;
}

function formatMetaDateIso(value: Date | string | null | undefined): string {
	if (value == null) return new Date(0).toISOString();
	if (value instanceof Date) return value.toISOString();
	const parsed = Date.parse(String(value));
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}

export function publicAuthorAvatarFromImageValue(
	avatar?: ImageValue
): PublicAuthorAvatar | undefined {
	if (!avatar?.asset?.url) return undefined;
	const alt = avatar.alt ?? avatar.asset.alt;
	return {
		url: avatar.asset.url,
		...(alt ? { alt } : {}),
		...(avatar.asset.srcset ? { srcSet: avatar.asset.srcset } : {})
	};
}

export function toPublicAuthorDetail(author: AuthorInfo | null): PublicAuthorDetail | null {
	if (!author) return null;
	const avatar = publicAuthorAvatarFromImageValue(author.avatar);
	return {
		id: author.id,
		name: author.name,
		slug: author.slug,
		...(author.role ? { role: author.role } : {}),
		...(avatar ? { avatar } : {})
	};
}

export function toPublicAuthorListItem(author: AuthorInfo | null): PublicAuthorListItem | null {
	if (!author) return null;
	return {
		name: author.name,
		slug: author.slug,
		...(author.role ? { role: author.role } : {})
	};
}

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
					ogImage:
						typeof post.seo.ogImage === 'string' ? post.seo.ogImage : post.seo.ogImage?.asset?.url,
					noIndex: post.seo.noIndex
				}
			: undefined,
		author: toPublicAuthorDetail(author),
		coAuthors: coAuthors
			.map((a) => toPublicAuthorDetail(a))
			.filter((a): a is PublicAuthorDetail => !!a),
		tags,
		sourcePublishedAt: post.importSource?.sourcePublishedAt ?? null,
		...(post.postDate ? { postDate: post.postDate } : {}),
		updatedAt: formatMetaDateIso(post._meta?.updatedAt),
		readingTimeMinutes: readingTimeMinutes(post.content),
		adminEditPath: blogPostAdminEditPath(post.id)
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
	author: PublicAuthorListItem | null;
	readingTimeMinutes: number;
	updatedAt: string;
};

export function buildPublicBlogPostListItem(
	post: BlogPost,
	tags: TagInfo[],
	author: AuthorInfo | null,
	mediaOrigin: string
): PublicBlogPostListItem {
	const item: PublicBlogPostListItem = {
		slug: post.slug,
		title: post.title,
		excerpt: post.excerpt,
		coverImage: post.coverImage,
		tags: tags.map(({ slug, title }) => ({ slug, title })),
		postDate: post.postDate,
		sourcePublishedAt: post.importSource?.sourcePublishedAt ?? null,
		author: toPublicAuthorListItem(author),
		readingTimeMinutes: readingTimeMinutes(post.content),
		updatedAt: formatMetaDateIso(post._meta?.updatedAt)
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
