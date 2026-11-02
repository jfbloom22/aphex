import { z } from 'zod';
import { definePlugin } from '@aphexcms/cms-core';
import type { AgentToolExecutor, AgentToolResult } from '@aphexcms/cms-core/schema';
import { labNotesEvalEnabled } from '$lib/lab-notes-eval/config';
import { mintBlogPostPreviewToken } from '$lib/lab-notes-eval/preview-tokens';
import { labNotesPreviewViewUrl } from '$lib/lab-notes-eval/public-origin';
import type { BlogPostWithLocalMeta } from '$lib/lab-notes-eval/document-meta';

const evalEnabled = () =>
	['true', '1', 'yes', 'on'].includes((process.env.LAB_NOTES_EVAL ?? '').toLowerCase());

const PLUGIN_ID = '@aphexcms/lab-notes-eval';

const previewDraftInputSchema = z.object({
	slug: z.string().describe('blog_post slug'),
	collection: z.string().optional().describe('Collection name (default blog_post)')
});

const mintPreviewTokenInputSchema = z.object({
	slug: z.string().optional(),
	documentId: z.string().optional(),
	collection: z.string().optional()
});

const mintPreviewTokenExecute: AgentToolExecutor = async (input, ctx) => {
	if (!evalEnabled()) {
		return { success: false, error: 'LAB_NOTES_EVAL is not enabled on this server.' };
	}
	const parsed = mintPreviewTokenInputSchema.safeParse(input);
	if (!parsed.success) {
		return { success: false, error: 'Invalid arguments: slug or documentId required' };
	}
	const collection = parsed.data.collection ?? 'blog_post';
	if (collection !== 'blog_post') {
		return { success: false, error: 'Only blog_post previews are supported in Lab Notes eval.' };
	}
	const col = ctx.aphexCMS.localAPI.getCollection(collection);
	if (!col) return { success: false, error: `Unknown collection: ${collection}` };
	const draftCtx = { ...ctx.context, perspective: 'draft' as const, overrideAccess: true };
	let doc: BlogPostWithLocalMeta | undefined;
	if (parsed.data.documentId) {
		doc = (await col.get(draftCtx, { id: parsed.data.documentId })) as BlogPostWithLocalMeta;
	} else if (parsed.data.slug) {
		const found = await col.find(draftCtx, {
			limit: 1,
			where: { slug: { equals: parsed.data.slug } }
		});
		doc = found.docs[0] as BlogPostWithLocalMeta | undefined;
	} else {
		return { success: false, error: 'slug or documentId required' };
	}
	if (!doc?.id || !doc.slug) return { success: false, error: 'Draft not found' };
	const cap = await mintBlogPostPreviewToken(doc.id, doc.slug);
	return {
		success: true,
		data: {
			token: cap.token,
			expiresAt: cap.expiresAt,
			documentId: doc.id,
			slug: doc.slug,
			viewUrl: labNotesPreviewViewUrl(doc.slug, cap.token)
		}
	};
};

const previewDraftUrlExecute: AgentToolExecutor = async (input, ctx) => {
	if (!evalEnabled()) {
		return { success: false, error: 'LAB_NOTES_EVAL is not enabled on this server.' };
	}
	const parsed = previewDraftInputSchema.safeParse(input);
	if (!parsed.success) {
		return { success: false, error: 'Invalid arguments: slug is required' };
	}
	const { slug, collection: collectionArg } = parsed.data;
	const collection = collectionArg ?? 'blog_post';
	if (collection !== 'blog_post') {
		return {
			success: false,
			error: 'Only blog_post previews are supported in Lab Notes eval.'
		};
	}
	const col = ctx.aphexCMS.localAPI.getCollection(collection);
	if (!col) return { success: false, error: `Unknown collection: ${collection}` };
	const found = await col.find(ctx.context, {
		limit: 1,
		where: { slug: { equals: slug } },
		perspective: 'draft'
	});
	const doc = found.docs[0] as BlogPostWithLocalMeta | undefined;
	if (!doc?.id) return { success: false, error: `No draft found for slug: ${slug}` };
	const cap = await mintBlogPostPreviewToken(doc.id, slug);
	return {
		success: true,
		data: {
			url: labNotesPreviewViewUrl(slug, cap.token),
			expiresAt: cap.expiresAt,
			documentId: doc.id,
			revision: doc._meta?.revision
		}
	};
};

const listInteractiveInputSchema = z.object({});

const listInteractiveExecute: AgentToolExecutor = async (
	_input,
	_ctx
): Promise<AgentToolResult> => {
	if (!evalEnabled()) {
		return { success: false, error: 'LAB_NOTES_EVAL is not enabled on this server.' };
	}
	return {
		success: true,
		data: {
			components: [
				{
					id: 'run-prompt',
					schemaName: 'runPrompt',
					propsSchema: {
						type: 'object',
						properties: {
							prompt: { type: 'string' },
							label: { type: 'string' }
						},
						required: ['prompt']
					},
					usage: 'Portable Text custom block `_type: runPrompt` with prompt text.'
				},
				{
					id: 'fluency-level-picker',
					schemaName: 'fluencyLevelPicker',
					propsSchema: {
						type: 'object',
						properties: {
							initialLevel: { type: 'string', enum: ['explorer', 'guide', 'builder'] }
						}
					},
					usage: 'Portable Text custom block `_type: fluencyLevelPicker`.'
				}
			]
		}
	};
};

/**
 * App glue for SPR-071 — maps custom POC tool names onto Aphex draft/publish semantics.
 * Only active when LAB_NOTES_EVAL is set; core CMS MCP tools remain the source of truth.
 */
export const labNotesEvalPlugin = definePlugin({
	name: PLUGIN_ID,
	parts: [
		{
			implements: 'aphex/agent/tool',
			definition: {
				name: 'mint_preview_token',
				description:
					'Mint a short-lived preview token and website view URL for a blog_post draft (React site ?preview=). Does not publish.',
				mutates: true,
				requiredCapabilities: ['document.read'],
				execution: 'server',
				inputSchema: mintPreviewTokenInputSchema
			},
			execute: mintPreviewTokenExecute
		},
		{
			implements: 'aphex/agent/tool',
			definition: {
				name: 'preview_draft_url',
				description:
					'Mint a private, expiring preview URL for a blog_post draft (same renderer as /blog). Requires slug. Does not publish.',
				mutates: false,
				requiredCapabilities: ['document.read'],
				execution: 'server',
				inputSchema: previewDraftInputSchema
			},
			execute: previewDraftUrlExecute
		},
		{
			implements: 'aphex/agent/tool',
			definition: {
				name: 'list_interactive_components',
				description:
					'Lab Notes interactive block registry (native Svelte). Maps to runPrompt and fluency-level-picker blocks in blog_post content.',
				mutates: false,
				requiredCapabilities: ['document.read'],
				execution: 'server',
				inputSchema: listInteractiveInputSchema
			},
			execute: listInteractiveExecute
		}
	]
});
