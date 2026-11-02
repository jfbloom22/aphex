import type { CMSConfig } from '@aphexcms/cms-core';
import type { DatabaseAdapter } from '@aphexcms/cms-core/server';
import { createLocalAPI } from '@aphexcms/cms-core/server';
import { authService } from '$lib/server/auth';
import { registerDefaultAuthorResolver } from './default-author-context';

let wired = false;

/** Wire Local API lookup for the client-safe create hook (once per process). */
export function ensureDefaultAuthorResolver(config: CMSConfig, adapter: DatabaseAdapter): void {
	if (wired) return;
	wired = true;

	const localAPI = createLocalAPI(config, adapter);

	registerDefaultAuthorResolver(async ({ organizationId, userId }) => {
		const ctx = {
			organizationId,
			perspective: 'draft' as const,
			overrideAccess: true
		};
		const found = await localAPI.collections.author.find(ctx, {
			limit: 1,
			where: { userId: { equals: userId } }
		});
		const id = found.docs[0]?.id;
		if (!id) return null;
		return { _type: 'reference' as const, _ref: id };
	});
}

export type AuthorUserLink = { authorSlug: string; userEmail: string };

/**
 * Idempotent: set `author.userId` when slug + email match and userId is unset.
 * Does not overwrite an existing userId. Safe for production one-shot via env.
 */
export async function applyAuthorUserLinks(
	config: CMSConfig,
	adapter: DatabaseAdapter,
	organizationId: string,
	links: AuthorUserLink[]
): Promise<void> {
	if (!links.length) return;

	const localAPI = createLocalAPI(config, adapter);
	const ctx = {
		organizationId,
		overrideAccess: true,
		perspective: 'draft' as const
	};

	for (const { authorSlug, userEmail } of links) {
		const user = await authService.getUserByEmail(userEmail.trim());
		if (!user?.id) continue;

		const found = await localAPI.collections.author.find(ctx, {
			limit: 1,
			where: { slug: { equals: authorSlug.trim() } }
		});
		const author = found.docs[0];
		if (!author?.id) continue;
		if (author.userId) continue;

		await localAPI.collections.author.update(ctx, author.id, {
			userId: user.id
		});
	}
}

/** Parse `slug:email,slug:email` from APHEX_AUTHOR_USER_LINKS. */
export function parseAuthorUserLinksEnv(raw: string | undefined): AuthorUserLink[] {
	if (!raw?.trim()) return [];
	const links: AuthorUserLink[] = [];
	for (const segment of raw.split(',')) {
		const trimmed = segment.trim();
		if (!trimmed) continue;
		const colon = trimmed.indexOf(':');
		if (colon <= 0) continue;
		links.push({
			authorSlug: trimmed.slice(0, colon).trim(),
			userEmail: trimmed.slice(colon + 1).trim()
		});
	}
	return links;
}
