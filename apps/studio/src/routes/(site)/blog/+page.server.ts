import type { PageServerLoad } from './$types';
import { siteContext } from '$lib/server/site';
import { loadTagMap } from '$lib/blog/tags';
import { labNotesEvalEnabled } from '$lib/lab-notes-eval/config';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { orgId, context } = await siteContext(locals);
	const localAPI = locals.aphexCMS.localAPI;
	const tagMap = await loadTagMap(localAPI, context);

	const result = await localAPI.collections.blog_post.find(context, {
		limit: 100,
		perspective: 'published'
	});

	let posts = [...result.docs].sort((a, b) => (b.postDate ?? '').localeCompare(a.postDate ?? ''));

	if (labNotesEvalEnabled()) {
		posts = posts.filter((post) => {
			const refs = post.tags ?? [];
			return refs.some((ref) => {
				const id = typeof ref === 'string' ? ref : ref._ref;
				const tag = id ? tagMap[id] : undefined;
				return tag?.slug === 'lab-notes';
			});
		});
		const topic = url.searchParams.get('topic');
		if (topic) {
			posts = posts.filter((post) => {
				const refs = post.tags ?? [];
				return refs.some((ref) => {
					const id = typeof ref === 'string' ? ref : ref._ref;
					const tag = id ? tagMap[id] : undefined;
					return tag?.slug === topic;
				});
			});
		}
	}

	await locals.aphexCMS.assetService.injectAssetUrls(orgId, ...posts);

	return {
		posts,
		tagMap,
		labNotesEval: labNotesEvalEnabled(),
		topic: url.searchParams.get('topic')
	};
};
