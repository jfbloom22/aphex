import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createLocalAPI } from '@aphexcms/cms-core/server';
import { db } from '../src/lib/server/db';
import cmsConfig from '../aphex.config';
import { TEST_ORG_ID } from './helpers/test-constants';
import { registerDefaultAuthorResolver } from '$lib/blog/default-author-context';

let localAPI: ReturnType<typeof createLocalAPI>;
const created: { type: 'author' | 'blog_post'; id: string }[] = [];

beforeAll(() => {
	localAPI = createLocalAPI(cmsConfig, db);
	registerDefaultAuthorResolver(async ({ userId }) => {
		const ctx = {
			organizationId: TEST_ORG_ID,
			user: { id: userId },
			overrideAccess: true,
			perspective: 'draft' as const
		};
		const found = await localAPI.collections.author.find(ctx, {
			limit: 1,
			where: { userId: { equals: userId } }
		});
		const id = found.docs[0]?.id;
		return id ? { _type: 'reference' as const, _ref: id } : null;
	});
});

afterAll(async () => {
	for (const row of created.reverse()) {
		await localAPI.collections[row.type]
			.delete({ organizationId: TEST_ORG_ID, overrideAccess: true }, row.id)
			.catch(() => {});
	}
});

describe('blog_post default author on create', () => {
	it('sets author from linked author document when author is empty', async () => {
		const userId = `default-author-user-${Date.now()}`;
		const authorRes = await localAPI.collections.author.create(
			{
				organizationId: TEST_ORG_ID,
				user: { id: userId },
				overrideAccess: true
			},
			{
				name: 'Linked Writer',
				slug: `linked-writer-${Date.now()}`,
				userId
			} as never,
			{ publish: true }
		);
		created.push({ type: 'author', id: authorRes.document.id });

		const postRes = await localAPI.collections.blog_post.create(
			{
				organizationId: TEST_ORG_ID,
				user: { id: userId },
				overrideAccess: true
			},
			{
				title: 'Default author post',
				slug: `default-author-${Date.now()}`,
				content: [
					{
						_type: 'block',
						_key: 'b1',
						style: 'normal',
						markDefs: [],
						children: [{ _type: 'span', _key: 's1', text: 'Body', marks: [] }]
					}
				]
			} as never
		);
		created.push({ type: 'blog_post', id: postRes.document.id });

		expect(postRes.document.author?._ref).toBe(authorRes.document.id);
	});

	it('does not overwrite an explicit author on create', async () => {
		const userId = `explicit-author-user-${Date.now()}`;
		const linked = await localAPI.collections.author.create(
			{
				organizationId: TEST_ORG_ID,
				user: { id: userId },
				overrideAccess: true
			},
			{
				name: 'Linked',
				slug: `linked-${Date.now()}`,
				userId
			} as never,
			{ publish: true }
		);
		created.push({ type: 'author', id: linked.document.id });

		const other = await localAPI.collections.author.create(
			{ organizationId: TEST_ORG_ID, overrideAccess: true },
			{ name: 'Chosen', slug: `chosen-${Date.now()}` } as never,
			{ publish: true }
		);
		created.push({ type: 'author', id: other.document.id });

		const postRes = await localAPI.collections.blog_post.create(
			{
				organizationId: TEST_ORG_ID,
				user: { id: userId },
				overrideAccess: true
			},
			{
				title: 'Explicit author',
				slug: `explicit-author-${Date.now()}`,
				author: { _type: 'reference', _ref: other.document.id },
				content: [
					{
						_type: 'block',
						_key: 'b1',
						style: 'normal',
						markDefs: [],
						children: [{ _type: 'span', _key: 's1', text: 'Body', marks: [] }]
					}
				]
			} as never
		);
		created.push({ type: 'blog_post', id: postRes.document.id });

		expect(postRes.document.author?._ref).toBe(other.document.id);
	});
});
