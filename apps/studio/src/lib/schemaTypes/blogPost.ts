import { defineType } from '@aphexcms/cms-core';
import { searchableFields } from '@aphexcms/cms-core/schema';
import { BookOpen } from '@lucide/svelte';
import {
	callout,
	codeBlock,
	embed,
	toggle,
	divider,
	button,
	gallery,
	runPrompt,
	fluencyLevelPicker
} from './objects/blocks.js';
import videoBlock from './videoBlock.js';

const blogPostType = defineType({
	type: 'document',
	name: 'blog_post',
	title: 'Blog Post',
	description: 'A blog post with rich text content',
	icon: BookOpen,
	groups: [
		{ name: 'content', title: 'Content', default: true },
		{ name: 'settings', title: 'Settings' },
		{ name: 'seo', title: 'SEO' }
	],
	preview: {
		select: {
			title: 'title',
			subtitle: 'excerpt',
			media: 'coverImage'
		}
	},
	// Relative path — resolved against the studio's own origin for the preview
	// iframe. Return an absolute URL here to point the preview at a separate
	// public site (e.g. `${import.meta.env.VITE_SITE_URL}/blog/${slug}`).
	previewUrl: (doc) => {
		const slug = doc.slug as string | undefined;
		return slug ? `/blog/${slug}?aphex-preview=1` : null;
	},
	fields: [
		{
			name: 'title',
			type: 'string',
			title: 'Title',
			group: 'content',
			validation: (Rule) => Rule.required()
		},
		{
			name: 'slug',
			type: 'slug',
			title: 'Slug',
			source: 'title',
			group: 'settings',
			validation: (Rule) => Rule.required()
		},
		{
			name: 'author',
			type: 'reference',
			title: 'Author',
			to: [{ type: 'author' }],
			group: 'settings'
		},
		{
			name: 'postDate',
			type: 'date',
			title: 'Published Date',
			group: 'settings'
		},
		{
			name: 'coAuthors',
			type: 'array',
			title: 'Co-authors',
			group: 'settings',
			of: [{ type: 'reference', to: [{ type: 'author' }] }]
		},
		{
			name: 'excerpt',
			type: 'text',
			title: 'Excerpt',
			description: 'A short summary shown on the blog listing page',
			group: 'content'
		},
		{
			name: 'coverImage',
			type: 'image',
			title: 'Cover Image',
			group: 'content'
		},
		{
			name: 'content',
			type: 'array',
			title: 'Content',
			group: 'content',
			of: [
				{
					type: 'block',
					marks: {
						annotations: [
							{
								name: 'link',
								title: 'Link',
								fields: [
									{ name: 'href', type: 'url', title: 'URL' },
									{
										name: 'blank',
										type: 'boolean',
										title: 'Open in new tab'
									}
								]
							}
						]
					}
				},
				{ type: 'image', title: 'Image' },
				callout,
				codeBlock,
				embed,
				toggle,
				divider,
				button,
				gallery,
				videoBlock,
				runPrompt,
				fluencyLevelPicker
			],
			validation: (Rule) => Rule.required()
		},
		{
			name: 'tags',
			type: 'array',
			title: 'Tags',
			group: 'settings',
			description: 'Topics this post belongs to',
			of: [{ type: 'reference', to: [{ type: 'tag' }] }]
		},
		{
			name: 'importSource',
			type: 'object',
			title: 'Import source',
			group: 'settings',
			description: 'Written by Ghost import; used for idempotent updates',
			fields: [
				{ name: 'sourceSystem', type: 'string', title: 'Source system' },
				{ name: 'externalId', type: 'string', title: 'External id' },
				{ name: 'contentHash', type: 'string', title: 'Content hash' },
				{
					name: 'revisionAtImport',
					type: 'number',
					title: 'Revision at last import'
				},
				{ name: 'importedAt', type: 'datetime', title: 'Last imported at' },
				{
					name: 'sourcePublishedAt',
					type: 'datetime',
					title: 'Source published at',
					description: 'Exact publication time from Ghost (importSource.sourcePublishedAt)'
				}
			]
		},
		{
			name: 'importReview',
			type: 'object',
			title: 'Import review',
			group: 'settings',
			fields: [
				{
					name: 'failures',
					type: 'array',
					title: 'Review failures',
					of: [{ type: 'string' }]
				}
			]
		}
		// SEO is auto-injected by seoPlugin({ collections: [...] }) in plugins.ts.
	]
});

// `search` is derived from the declared fields, so it can't sit inside the
// `defineType` call that declares them.
const blogPost = { ...blogPostType, search: searchableFields(blogPostType) };

export default blogPost;
