import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { labNotesEvalEnabled } from '$lib/lab-notes-eval/config';
import { validatePreviewCapability } from '$lib/lab-notes-eval/preview-capabilities';
import { siteContext } from '$lib/server/site';
import { loadTagMap } from '$lib/blog/tags';
import { loadAuthorMap } from '$lib/blog/authors';

export const load: PageServerLoad = async ({ locals, params, request, url, setHeaders }) => {
	if (!labNotesEvalEnabled()) error(404, 'Not found');
	setHeaders({ 'cache-control': 'no-store' });
	const token = url.searchParams.get('capability');
	if (!token || !(await validatePreviewCapability(params.slug, token))) {
		error(401, 'Preview requires a valid capability token');
	}
	const { orgId, context } = await siteContext(locals);
	const draftContext = { ...context, perspective: 'draft' as const };
	const localAPI = locals.aphexCMS.localAPI;
	const assetService = locals.aphexCMS.assetService;

	const result = await localAPI.collections.blog_post.find(draftContext, {
		limit: 1,
		where: { slug: { equals: params.slug } }
	});
	const post = result.docs[0];
	if (!post) error(404, 'Draft not found');

	const [tagMap, authorMap] = await Promise.all([
		loadTagMap(localAPI, draftContext),
		loadAuthorMap(localAPI, draftContext, assetService, orgId)
	]);
	await assetService.injectAssetUrls(orgId, post);

	return { post, tagMap, authorMap, previewCapability: token };
};

export const prerender = false;
