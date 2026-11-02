/**
 * Ghost / Lab Notes HTML → Aphex Portable Text via @portabletext/html (official converter;
 * @portabletext/block-tools wraps the same engine for Sanity schemas — see block-tools README).
 */
import { compileSchema, defineSchema } from '@portabletext/schema';
import { htmlToPortableText } from '@portabletext/html';
import { JSDOM } from 'jsdom';

const labNotesPtSchema = compileSchema(
	defineSchema({
		decorators: [
			{ name: 'strong' },
			{ name: 'em' },
			{ name: 'underline' },
			{ name: 'strike-through' },
			{ name: 'code' }
		],
		styles: [
			{ name: 'normal' },
			{ name: 'h1' },
			{ name: 'h2' },
			{ name: 'h3' },
			{ name: 'h4' },
			{ name: 'h5' },
			{ name: 'h6' },
			{ name: 'blockquote' }
		],
		lists: [{ name: 'bullet' }, { name: 'number' }],
		annotations: [
			{
				name: 'link',
				fields: [
					{ name: 'href', type: 'string' },
					{ name: 'blank', type: 'boolean' }
				]
			}
		],
		blockObjects: [
			{
				name: 'runPrompt',
				fields: [
					{ name: 'prompt', type: 'string' },
					{ name: 'label', type: 'string' }
				]
			},
			{
				name: 'fluencyLevelPicker',
				fields: [{ name: 'initialLevel', type: 'string' }]
			}
		]
	})
);

const wlInteractiveRules = [
	{
		deserialize(el, _next, createBlock) {
			const kind = el.getAttribute?.('data-wl-block');
			if (kind === 'runPrompt') {
				const raw = el.getAttribute('data-prompt') ?? '';
				let prompt = raw;
				try {
					prompt = decodeURIComponent(raw);
				} catch {
					/* keep raw */
				}
				return createBlock({
					_type: 'runPrompt',
					prompt,
					label: el.getAttribute('data-label') ?? 'Try this prompt'
				});
			}
			if (kind === 'fluencyLevelPicker') {
				return createBlock({
					_type: 'fluencyLevelPicker',
					initialLevel: el.getAttribute('data-initial-level') ?? 'guide'
				});
			}
			return undefined;
		}
	}
];

/** @param {string} html */
export function parseHtmlDocument(html) {
	const wrapped = html.trim().startsWith('<')
		? `<!DOCTYPE html><html><body>${html}</body></html>`
		: `<!DOCTYPE html><html><body><p>${html}</p></body></html>`;
	return new JSDOM(wrapped).window.document;
}

function decodeHtmlAttr(value) {
	return value
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>');
}

/**
 * Replace Ghost run-prompt cards with `data-wl-block` placeholders for htmlToPortableText rules.
 * @param {string} html
 * @returns {{ html: string, runPromptCount: number }}
 */
export function injectRunPromptPlaceholders(html) {
	let runPromptCount = 0;
	const placeholder = (prompt) => {
		runPromptCount += 1;
		const enc = encodeURIComponent(prompt);
		return `<div data-wl-block="runPrompt" data-prompt="${enc}" data-label="Try this prompt"></div>`;
	};
	const withCards = html.replace(
		/<!--kg-card-begin: html-->[\s\S]*?<p[^>]*data-wl-visual=["']run-prompt["'][^>]*data-wl-prompt=["']([^"']*)["'][^>]*>[\s\S]*?<!--kg-card-end: html-->/gi,
		(_m, promptEnc) => {
			const decoded = decodeHtmlAttr(promptEnc).replaceAll('\\n', '\n');
			return placeholder(decoded);
		}
	);
	const plain = withCards.replace(
		/<p[^>]*data-wl-visual=["']run-prompt["'][^>]*data-wl-prompt=["']([^"']*)["'][^>]*>\s*<\/p>/gi,
		(_m, promptEnc) => {
			const decoded = decodeURIComponent(decodeHtmlAttr(promptEnc)).replaceAll('\\n', '\n');
			return placeholder(decoded);
		}
	);
	return { html: plain, runPromptCount };
}

const KNOWN_KG_CARD_TYPES = new Set([
	'html',
	'image',
	'embed',
	'bookmark',
	'gallery',
	'button',
	'callout',
	'product',
	'nft',
	'header',
	'markdown',
	'signup',
	'toggle',
	'video',
	'audio',
	'file'
]);

/**
 * Detect Ghost HTML patterns we do not convert; surfaced on the draft for review.
 * @param {string} html
 * @returns {string[]}
 */
export function scanGhostHtmlReviewFailures(html) {
	const failures = [];
	const source = html ?? '';

	for (const match of source.matchAll(/<!--kg-card-begin:\s*([^>]+?)-->/gi)) {
		const kind = match[1].trim().toLowerCase();
		if (!KNOWN_KG_CARD_TYPES.has(kind)) {
			failures.push(`unknown kg-card: ${kind}`);
		}
	}

	for (const match of source.matchAll(/data-wl-visual=["']([^"']+)["']/gi)) {
		const visual = match[1];
		if (visual !== 'run-prompt') {
			failures.push(`unsupported data-wl-visual: ${visual}`);
		}
	}

	for (const match of source.matchAll(/data-wl-block=["']([^"']+)["']/gi)) {
		const block = match[1];
		if (block !== 'runPrompt' && block !== 'fluencyLevelPicker') {
			failures.push(`unsupported data-wl-block: ${block}`);
		}
	}

	if (/<script[\s>]/i.test(source)) {
		failures.push('script tag in HTML body');
	}

	return [...new Set(failures)];
}

/**
 * @param {string} ghostHtml
 * @returns {{ blocks: import('@portabletext/html').PortableTextBlock[], runPromptCount: number, reviewFailures: string[] }}
 */
export function ghostHtmlToPortableText(ghostHtml) {
	const reviewFailures = scanGhostHtmlReviewFailures(ghostHtml ?? '');
	const { html, runPromptCount } = injectRunPromptPlaceholders(ghostHtml ?? '');
	const blocks = htmlToPortableText(html, {
		schema: labNotesPtSchema,
		rules: wlInteractiveRules,
		parseHtml: (fragment) => parseHtmlDocument(fragment),
		whitespaceMode: 'normalize'
	});
	return { blocks, runPromptCount, reviewFailures };
}

/**
 * Unique http(s) hrefs in article HTML (Ghost body), for import verification.
 * @param {string} html
 * @returns {string[]}
 */
export function extractArticleLinkHrefs(html) {
	const doc = parseHtmlDocument(html ?? '');
	const hrefs = new Set();
	for (const a of doc.querySelectorAll('a[href]')) {
		const href = a.getAttribute('href')?.trim();
		if (!href || href.startsWith('#') || href.startsWith('mailto:')) continue;
		if (href.startsWith('http://') || href.startsWith('https://')) hrefs.add(href);
	}
	return [...hrefs];
}

/**
 * @param {unknown[]} blocks
 */
export function countRunPromptBlocks(blocks) {
	return blocks.filter((b) => b && typeof b === 'object' && b._type === 'runPrompt').length;
}

/**
 * @param {unknown[]} blocks
 */
export function portableTextHasLinkHref(blocks, href) {
	for (const node of blocks) {
		if (!node || typeof node !== 'object') continue;
		if (node._type === 'block' && Array.isArray(node.markDefs)) {
			for (const def of node.markDefs) {
				if (def?._type === 'link' && def.href === href) return true;
			}
		}
	}
	return false;
}

/** HTML for the private native-svelte-visual-lab draft (not markdown). */
export function visualLabDraftHtml() {
	return `
<h2>A native Svelte visual</h2>
<p>Choose a level below. This component is precompiled Svelte; the article stores only its name and properties.</p>
<div data-wl-block="fluencyLevelPicker" data-initial-level="guide"></div>
<h2>Notes</h2>
<p>Private eval draft. Not on the public archive until published.</p>
`.trim();
}

export function visualLabDraftPortableText() {
	return ghostHtmlToPortableText(visualLabDraftHtml()).blocks;
}
