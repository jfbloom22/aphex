import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { labNotesEvalEnabled } from '$lib/lab-notes-eval/config';
import {
	buildPublicBlogPostListItem,
	postInLabNotesPublicArchive
} from '$lib/lab-notes-eval/public-blog-post-api';
import { siteContext } from '$lib/server/site';
import { loadTagMap, postTags } from '$lib/blog/tags';

/** Published Lab Notes archive for the React site (no drafts). */
export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	if (!labNotesEvalEnabled()) error(404, 'Not found');
	setHeaders({ 'cache-control': 'public, max-age=60, stale-while-revalidate=120' });

	const { orgId, context } = await siteContext(locals);
	const pubCtx = { ...context, perspective: 'published' as const };
	const localAPI = locals.aphexCMS.localAPI;
	const assetService = locals.aphexCMS.assetService;

	const tagMap = await loadTagMap(localAPI, pubCtx);
	const result = await localAPI.collections.blog_post.find(pubCtx, {
		limit: 200
	});

	let posts = result.docs.filter((post) => postInLabNotesPublicArchive(post, tagMap));
	posts.sort((a, b) => (b.postDate ?? '').localeCompare(a.postDate ?? ''));

	await assetService.injectAssetUrls(orgId, ...posts);

	const mediaOrigin = url.origin;
	const items = posts.map((post) =>
		buildPublicBlogPostListItem(post, postTags(post.tags, tagMap), mediaOrigin)
	);

	return json({ success: true, data: items });
};
