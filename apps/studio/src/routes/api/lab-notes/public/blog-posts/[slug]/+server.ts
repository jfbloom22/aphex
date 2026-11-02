import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { labNotesEvalEnabled } from '$lib/lab-notes-eval/config';
import { resolvePreviewTokenForSlug } from '$lib/lab-notes-eval/preview-tokens';
import {
	buildPublicBlogPostPayload,
	finalizePublicBlogPostPayload
} from '$lib/lab-notes-eval/public-blog-post-api';
import { siteContext } from '$lib/server/site';
import { loadTagMap, postTags } from '$lib/blog/tags';
import { loadAuthorMap, postAuthor } from '$lib/blog/authors';

async function loadBlogPostBySlug(
	locals: App.Locals,
	slug: string,
	perspective: 'draft' | 'published'
) {
	const { orgId, context } = await siteContext(locals);
	const ctx = { ...context, perspective };
	const localAPI = locals.aphexCMS.localAPI;
	const assetService = locals.aphexCMS.assetService;

	const found = await localAPI.collections.blog_post.find(ctx, {
		limit: 1,
		where: { slug: { equals: slug } }
	});
	const post = found.docs[0];
	if (!post?.id) return null;

	const [tagMap, authorMap] = await Promise.all([
		loadTagMap(localAPI, ctx),
		loadAuthorMap(localAPI, ctx, assetService, orgId)
	]);
	await assetService.injectAssetUrls(orgId, post);

	const author = postAuthor(post.author, authorMap);
	const coAuthors = (post.coAuthors ?? []).map((ref) => authorMap[ref._ref]).filter(Boolean);
	const tags = postTags(post.tags, tagMap);

	return {
		orgId,
		post,
		payload: buildPublicBlogPostPayload(post, author, coAuthors, tags)
	};
}

/** Public read for the React site — published by default; draft with valid `?preview=`. */
export const GET: RequestHandler = async ({ locals, params, url, setHeaders }) => {
	if (!labNotesEvalEnabled()) error(404, 'Not found');

	const previewToken = url.searchParams.get('preview');
	if (previewToken !== null && previewToken !== '') {
		setHeaders({ 'cache-control': 'no-store' });
		const row = await resolvePreviewTokenForSlug(params.slug, previewToken);
		if (!row) error(401, 'Invalid or expired preview token');

		const loaded = await loadBlogPostBySlug(locals, params.slug, 'draft');
		if (!loaded?.post.id || loaded.post.id !== row.documentId) error(404, 'Draft not found');

		return json({
			success: true,
			data: finalizePublicBlogPostPayload(loaded.payload, {
				previewToken,
				mediaOrigin: url.origin
			})
		});
	}

	setHeaders({ 'cache-control': 'public, max-age=60, stale-while-revalidate=120' });

	const loaded = await loadBlogPostBySlug(locals, params.slug, 'published');
	if (!loaded) error(404, 'Not found');

	return json({
		success: true,
		data: finalizePublicBlogPostPayload(loaded.payload, { mediaOrigin: url.origin })
	});
};
