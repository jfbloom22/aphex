import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
	extractArticleLinkHrefs,
	ghostHtmlToPortableText,
	portableTextHasLinkHref,
	visualLabDraftPortableText
} from './html-to-content.mjs';

const FIXTURE = `<p>Lead with <a href="https://example.org/article?ref=workplacelabs.io">source link</a> and <strong>emphasis</strong>.</p>
<ul><li>First</li><li>Second</li></ul>
<p data-wl-visual="run-prompt" data-wl-prompt="Try%20this%20prompt"></p>`;

describe('html-to-content', () => {
	it('converts links, emphasis, and lists via @portabletext/html', () => {
		const { blocks, runPromptCount } = ghostHtmlToPortableText(FIXTURE);
		assert.equal(runPromptCount, 1);
		assert.equal(
			portableTextHasLinkHref(blocks, 'https://example.org/article?ref=workplacelabs.io'),
			true
		);
		const normal = blocks.find(
			(b) => b._type === 'block' && b.style === 'normal' && b.listItem == null
		);
		assert.ok(normal?.children?.some((c) => c.marks?.includes('strong')));
		const listBlock = blocks.find((b) => b._type === 'block' && b.listItem === 'bullet');
		assert.equal(listBlock?.children?.[0]?.text, 'First');
		const rp = blocks.find((b) => b._type === 'runPrompt');
		assert.match(rp?.prompt ?? '', /Try this prompt/);
	});

	it('extracts http(s) hrefs from Ghost HTML', () => {
		const hrefs = extractArticleLinkHrefs(FIXTURE);
		assert.ok(hrefs.includes('https://example.org/article?ref=workplacelabs.io'));
	});

	it('builds visual lab draft with fluencyLevelPicker', () => {
		const blocks = visualLabDraftPortableText();
		assert.ok(blocks.some((b) => b._type === 'fluencyLevelPicker'));
		assert.ok(blocks.some((b) => b._type === 'block' && b.style === 'h2'));
	});

	it('maps real export links into Portable Text markDefs', async () => {
		const exportPath =
			process.env.LAB_NOTES_GHOST_EXPORT ??
			path.join(
				process.cwd(),
				'.aphex/lab-notes-eval/ghost-content-export.json'
			);
		let bundle;
		try {
			bundle = JSON.parse(readFileSync(exportPath, 'utf8'));
		} catch {
			return; // skip until fetch-ghost-export has run
		}
		const post = bundle.posts.find((p) => p.slug === 'swapping-the-engine-is-the-easy-part');
		assert.ok(post?.html);
		const sourceHrefs = extractArticleLinkHrefs(post.html);
		assert.ok(sourceHrefs.length > 0);
		const { blocks } = ghostHtmlToPortableText(post.html);
		for (const href of sourceHrefs.slice(0, 5)) {
			assert.equal(portableTextHasLinkHref(blocks, href), true, href);
		}
	});
});
