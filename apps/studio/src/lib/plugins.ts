/**
 * Client-safe plugin registry for the admin app.
 *
 * The admin page imports this directly (component parts can't cross SvelteKit
 * `load`); `aphex.config.ts` imports the same array so the server engine ingests
 * schema/route/transform parts. Keep this module free of server-only imports (DB
 * adapters, secrets) so it's safe in the browser bundle.
 */
import { seoPlugin } from '@aphexcms/plugin-seo';
import { colorPickerPlugin } from '@aphexcms/plugin-color-picker';
import { notifyPlugin } from './plugins/notify-plugin';
import { formsPlugin } from './forms/forms-plugin';

const LAB_NOTES_PUBLIC_ORIGIN = (
	process.env.LAB_NOTES_PUBLIC_ORIGIN ?? 'https://www.workplacelabs.io'
).replace(/\/$/, '');

export const plugins = [
	seoPlugin({
		collections: ['blog_post', 'page', 'author', 'tag'],
		generateTitle: (doc, ctx) => {
			if (ctx?.typeName === 'blog_post') {
				const base =
					typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : 'Untitled';
				return `${base} | Lab Notes | Workplace Labs`;
			}
			const t = doc.title ?? doc.name ?? doc.heading;
			return typeof t === 'string' ? t : '';
		},
		generateURL: (doc, { typeName }) => {
			const slug = typeof doc.slug === 'string' ? doc.slug : '';
			if (typeName === 'blog_post') {
				return `${LAB_NOTES_PUBLIC_ORIGIN}/blog/${slug}/`;
			}
			if (typeName === 'author') return `/author/${slug}`;
			if (typeName === 'tag') return `/tag/${slug}`;
			if (typeName === 'page') return `/${slug}`;
			return `/blog/${slug}`;
		}
	}),
	colorPickerPlugin(),
	notifyPlugin,
	formsPlugin
];
