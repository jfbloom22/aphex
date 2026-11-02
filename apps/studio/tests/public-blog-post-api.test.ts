import { describe, it, expect } from 'vitest';
import type { AuthorInfo } from '$lib/blog/authors';
import type { BlogPost } from '$lib/generated-types';
import {
	blogPostAdminEditPath,
	buildPublicBlogPostPayload,
	buildPublicBlogPostListItem,
	publicAuthorAvatarFromImageValue
} from '$lib/lab-notes-eval/public-blog-post-api';
import { readingTimeMinutes as readingTimeMinutesFromBlog } from '$lib/blog/reading-time-minutes';

const minimalContent = [
	{
		_type: 'block' as const,
		style: 'normal',
		children: [{ _type: 'span' as const, text: 'one two three four five', marks: [] }]
	}
] satisfies BlogPost['content'];

const basePost = {
	id: 'post-1',
	slug: 'hello-world',
	title: 'Hello',
	content: minimalContent,
	postDate: '2024-06-01',
	_meta: {
		type: 'blog_post',
		status: 'published' as const,
		organizationId: 'org-1',
		createdAt: new Date('2024-06-01T12:00:00.000Z'),
		updatedAt: new Date('2024-06-15T08:30:00.000Z')
	}
} satisfies BlogPost;

const author: AuthorInfo = {
	id: 'author-1',
	name: 'Jane Doe',
	slug: 'jane-doe',
	role: 'Writer',
	avatar: {
		asset: { url: '/media/a/avatar.jpg', srcset: '/media/a/avatar.jpg 1x', alt: 'Jane' }
	}
};

describe('readingTimeMinutes', () => {
	it('matches blog helper (220 wpm, min 1)', () => {
		expect(readingTimeMinutesFromBlog(minimalContent)).toBe(1);
		expect(readingTimeMinutesFromBlog(undefined)).toBe(1);
	});
});

describe('buildPublicBlogPostPayload', () => {
	it('includes byline, dates, reading time, and admin edit path', () => {
		const payload = buildPublicBlogPostPayload(basePost, author, [author], []);
		expect(payload.postDate).toBe('2024-06-01');
		expect(payload.updatedAt).toBe('2024-06-15T08:30:00.000Z');
		expect(payload.readingTimeMinutes).toBe(readingTimeMinutesFromBlog(minimalContent));
		expect(payload.adminEditPath).toBe(blogPostAdminEditPath('post-1'));
		expect(payload.author).toMatchObject({
			id: 'author-1',
			name: 'Jane Doe',
			slug: 'jane-doe',
			role: 'Writer'
		});
		expect(payload.author?.avatar).toEqual({
			url: '/media/a/avatar.jpg',
			srcSet: '/media/a/avatar.jpg 1x',
			alt: 'Jane'
		});
		expect(payload.coAuthors).toHaveLength(1);
	});

	it('preserves legacy fields', () => {
		const payload = buildPublicBlogPostPayload(basePost, null, [], []);
		expect(payload.slug).toBe('hello-world');
		expect(payload.sourcePublishedAt).toBeNull();
		expect(Array.isArray(payload.content)).toBe(true);
	});
});

describe('buildPublicBlogPostListItem', () => {
	it('includes list byline fields', () => {
		const item = buildPublicBlogPostListItem(basePost, [], author, 'https://cms.example');
		expect(item.author).toEqual({ name: 'Jane Doe', slug: 'jane-doe', role: 'Writer' });
		expect(item.readingTimeMinutes).toBeGreaterThanOrEqual(1);
		expect(item.updatedAt).toBe('2024-06-15T08:30:00.000Z');
	});
});

describe('publicAuthorAvatarFromImageValue', () => {
	it('maps injected asset to public avatar shape', () => {
		expect(publicAuthorAvatarFromImageValue(author.avatar)).toEqual({
			url: '/media/a/avatar.jpg',
			srcSet: '/media/a/avatar.jpg 1x',
			alt: 'Jane'
		});
	});
});
