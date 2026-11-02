import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mintMcpOAuthAccessToken, mcpCallOAuth, signInEmail } from './oauth-token.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.join(__dirname, '../..');
const base = process.env.LAB_NOTES_BASE ?? 'http://127.0.0.1:5192';
const dataRoot =
	process.env.LAB_NOTES_DATA_DIR ?? path.join(studioRoot, '.aphex/lab-notes-eval');

async function readMcpKey() {
	return (await readFile(path.join(dataRoot, 'mcp-api-key.txt'), 'utf8')).trim();
}

function cookieHeader(setCookieList) {
	if (!setCookieList?.length) return '';
	return setCookieList.map((c) => c.split(';')[0]).join('; ');
}

async function loadEvalIdentities() {
	const manifestPath = path.join(dataRoot, 'eval-identities.json');
	try {
		return JSON.parse(await readFile(manifestPath, 'utf8'));
	} catch {
		await fetch(`${base}/blog`);
		await new Promise((r) => setTimeout(r, 800));
		return JSON.parse(await readFile(manifestPath, 'utf8'));
	}
}

async function sessionDocPut(cookie, id, data, expectedRevision) {
	return fetch(`${base}/api/documents/${id}`, {
		method: 'PUT',
		headers: { origin: base, cookie, 'content-type': 'application/json' },
		body: JSON.stringify({ data, expectedRevision })
	});
}

async function sessionDocGet(cookie, id) {
	return fetch(`${base}/api/documents/${id}?perspective=draft`, {
		headers: { origin: base, cookie }
	});
}

async function mcpCall(apiKey, name, args) {
	const response = await fetch(`${base}/mcp`, {
		method: 'POST',
		headers: {
			'x-api-key': apiKey,
			accept: 'application/json, text/event-stream',
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: name,
			method: 'tools/call',
			params: { name, arguments: args }
		})
	});
	assert.equal(response.status, 200, `${name} HTTP`);
	const text = await response.text();
	const line = text.split('\n').find((l) => l.startsWith('data: '));
	assert.ok(line, 'SSE data line');
	const payload = JSON.parse(line.slice(6));
	if (payload.error) return { error: payload.error };
	const innerText = payload.result.content[0].text;
	let inner;
	try {
		inner = JSON.parse(innerText);
	} catch {
		return { error: innerText };
	}
	if (payload.result.isError || inner.success === false) {
		return { error: inner.error ?? innerText, raw: inner };
	}
	return inner.data ?? inner;
}

async function rest(apiKey, method, apiPath, body) {
	return fetch(`${base}${apiPath}`, {
		method,
		headers: {
			'x-api-key': apiKey,
			...(body ? { 'content-type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
}

async function deleteVerificationFixtures(staffCookie) {
	const res = await fetch(`${base}/api/lab-notes/cleanup-verification`, {
		method: 'POST',
		headers: { origin: base, cookie: staffCookie }
	});
	assert.equal(res.status, 200, `cleanup-verification → ${res.status}`);
	const body = await res.json();
	assert.equal(body.success, true);
	// Optional: REST delete when the MCP key includes `write` (see LAB_NOTES_EVALUATION.md).
}

function absoluteUrl(src) {
	if (!src) return null;
	if (src.startsWith('http')) return src;
	return `${base}${src.startsWith('/') ? '' : '/'}${src}`;
}

async function assertImage200(html, label) {
	const srcs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
	assert.ok(srcs.length >= 1, `${label}: expected at least one img`);
	for (const src of srcs) {
		const url = absoluteUrl(src);
		const res = await fetch(url);
		assert.equal(res.status, 200, `${label}: ${url}`);
	}
}

async function countArchiveLabNotesPosts() {
	const html = await (await fetch(`${base}/blog`)).text();
	return (html.match(/class="card-title/g) ?? []).length;
}

/** Corpus checks from import-manifest (count reconciled from Ghost export, not hard-coded). */
async function assertCorpusFromManifest(manifest) {
	const expected =
		manifest.sourcePostCount ?? manifest.posts.length;
	assert.equal(manifest.posts.length, expected, 'manifest posts vs sourcePostCount');
	assert.equal(manifest.coverPaths?.length ?? 0, expected, 'manifest covers');

	let renderedPrompts = 0;
	for (const post of manifest.posts) {
		const pageRes = await fetch(`${base}/blog/${post.slug}`);
		assert.equal(pageRes.status, 200, `${post.slug} public page`);
		const postHtml = await pageRes.text();
		const count = (postHtml.match(/>Copy prompt<\/button>/g) ?? []).length;
		assert.equal(count, post.runPromptCount, `${post.slug} runPrompt count`);
		renderedPrompts += count;
		if (post.hasCover) {
			assert.equal(post.hasCover, true, `${post.slug} cover in manifest`);
			await assertImage200(postHtml, post.slug);
		}
	}
	assert.equal(renderedPrompts, manifest.totalRunPrompts, 'total runPrompt controls');
	return renderedPrompts;
}

async function main() {
	assert.equal((await fetch(`${base}/mcp`, { method: 'POST' })).status, 401, 'MCP without key');
	assert.equal(
		(await fetch(`${base}/preview/native-svelte-visual-lab`)).status,
		401,
		'preview without capability'
	);
	const apiKey = await readMcpKey();
	const identities = await loadEvalIdentities();
	let staffACookie = await signInEmail(
		base,
		identities.users.staffA.email,
		identities.users.staffA.password
	);
	await deleteVerificationFixtures(staffACookie);

	const wellKnownAs = await fetch(`${base}/.well-known/oauth-authorization-server`);
	assert.equal(wellKnownAs.status, 200, 'oauth-authorization-server metadata');
	const wellKnownPr = await fetch(`${base}/.well-known/oauth-protected-resource`);
	assert.equal(wellKnownPr.status, 200, 'oauth-protected-resource metadata');

	const staffAToken = await mintMcpOAuthAccessToken(
		base,
		identities.users.staffA.email,
		identities.users.staffA.password,
		staffACookie
	);
	const staffBCookie = await signInEmail(
		base,
		identities.users.staffB.email,
		identities.users.staffB.password
	);
	const staffBToken = await mintMcpOAuthAccessToken(
		base,
		identities.users.staffB.email,
		identities.users.staffB.password,
		staffBCookie
	);

	await mcpCallOAuth(base, staffAToken, 'list_interactive_components', {});

	const slug = `verification-${Date.now()}`;
	let fixtureId;
	try {
		const created = await mcpCallOAuth(base, staffAToken, 'create_document', {
			collection: 'blog_post',
			data: {
				title: 'Local verification fixture',
				slug,
				excerpt: 'Temporary test',
				postDate: '2026-01-01',
				content: [
					{
						_type: 'runPrompt',
						_key: 'rp1',
						prompt: 'Verification prompt',
						label: 'Try this prompt'
					}
				]
			}
		});
		assert.ok(!created.error, JSON.stringify(created.error));
		fixtureId = created.document?.id ?? created.id;
		assert.ok(fixtureId, 'created id');
		assert.ok(created.links?.adminUrl?.includes('/admin?'), 'adminUrl on create');
		assert.ok(created.links?.previewUrl?.includes('/preview/'), 'previewUrl on create');
		const rev1 = created.document?._meta?.revision ?? created._meta?.revision;

		assert.equal((await fetch(`${base}/blog/${slug}`)).status, 404, 'draft not public');

		const preview = await mcpCallOAuth(base, staffAToken, 'preview_draft_url', { slug });
		assert.ok(!preview.error && preview.url?.includes('/preview/'), 'preview url');
		let previewRes = await fetch(preview.url);
		assert.equal(previewRes.status, 200);
		const cc = previewRes.headers.get('cache-control') ?? '';
		assert.match(cc, /no-store/i, 'preview Cache-Control');
		assert.match(await previewRes.text(), /Copy prompt/);

		const stale = await mcpCallOAuth(base, staffAToken, 'update_document', {
			collection: 'blog_post',
			id: fixtureId,
			data: { excerpt: 'stale' },
			expectedRevision: rev1 + 99
		});
		assert.ok(stale.error, 'stale MCP update must fail');

		const updated = await mcpCallOAuth(base, staffAToken, 'update_document', {
			collection: 'blog_post',
			id: fixtureId,
			data: { excerpt: 'Revised without rebuilding' },
			expectedRevision: rev1
		});
		assert.ok(!updated.error, JSON.stringify(updated.error));
		assert.ok(updated.links?.adminUrl, 'adminUrl on update');
		const rev2 = updated.document?._meta?.revision ?? updated._meta?.revision;

		const got = await mcpCallOAuth(base, staffBToken, 'get_document', {
			collection: 'blog_post',
			id: fixtureId,
			perspective: 'draft'
		});
		assert.ok(!got.error, 'staff B get_document draft');
		assert.equal(got.document?.excerpt ?? got.excerpt, 'Revised without rebuilding');

		const preview2 = await mcpCallOAuth(base, staffAToken, 'preview_draft_url', { slug });
		assert.ok(!preview2.error && preview2.url?.includes('/preview/'), 'preview url after update');
		previewRes = await fetch(preview2.url);
		assert.match(await previewRes.text(), /Revised without rebuilding/);

		const staffSessionMarker = `Staff-session-${Date.now()}`;
		const staffASave = await sessionDocPut(
			staffACookie,
			fixtureId,
			{ excerpt: staffSessionMarker },
			rev2
		);
		assert.equal(staffASave.status, 200, 'staff A session PUT draft');
		const staffASaveBody = await staffASave.json();
		const revAfterStaffSave =
			staffASaveBody.data?._meta?.revision ?? staffASaveBody.data?._meta?.revision ?? rev2;

		const staffBRead = await sessionDocGet(staffBCookie, fixtureId);
		assert.equal(staffBRead.status, 200, 'staff B session GET draft');
		const staffBBody = await staffBRead.json();
		assert.equal(staffBBody.data?.excerpt, staffSessionMarker, 'staff B reads staff A draft');

		const outsiderCookie = await signInEmail(
			base,
			identities.users.outsider.email,
			identities.users.outsider.password
		);
		const outsiderQuery = await fetch(`${base}/api/documents/query`, {
			method: 'POST',
			headers: {
				origin: base,
				cookie: outsiderCookie,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				type: 'blog_post',
				perspective: 'draft',
				where: { slug: { equals: slug } },
				limit: 1
			})
		});
		assert.ok(
			outsiderQuery.status === 401 || outsiderQuery.status === 403,
			`outsider draft query → ${outsiderQuery.status}`
		);
		const outsiderQueryText = await outsiderQuery.text();
		assert.ok(!outsiderQueryText.includes(staffSessionMarker), 'outsider must not see draft text');

		const outsiderMcp = await fetch(`${base}/mcp`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${await mintMcpOAuthAccessToken(
					base,
					identities.users.outsider.email,
					identities.users.outsider.password
				)}`,
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 'outsider-get',
				method: 'tools/call',
				params: {
					name: 'get_document',
					arguments: { collection: 'blog_post', id: fixtureId, perspective: 'draft' }
				}
			})
		});
		assert.equal(outsiderMcp.status, 401, 'outsider OAuth MCP denied');

		const pubDenied = await mcpCallOAuth(base, staffAToken, 'publish_document', {
			collection: 'blog_post',
			id: fixtureId
		});
		assert.ok(pubDenied.error, 'OAuth MCP publish must fail');
		assert.equal((await fetch(`${base}/blog/${slug}`)).status, 404);

		const createPubDenied = await mcpCallOAuth(base, staffAToken, 'create_document', {
			collection: 'blog_post',
			data: {
				title: 'Should not publish',
				slug: `${slug}-create-pub`,
				excerpt: 'x',
				postDate: '2026-01-01'
			},
			publish: true
		});
		assert.ok(createPubDenied.error, 'OAuth create publish:true must fail');

		const updatePubDenied = await mcpCallOAuth(base, staffAToken, 'update_document', {
			collection: 'blog_post',
			id: fixtureId,
			data: { excerpt: 'sneak publish' },
			publish: true,
			expectedRevision: revAfterStaffSave
		});
		assert.ok(updatePubDenied.error, 'OAuth update publish:true must fail');
		assert.equal((await fetch(`${base}/blog/${slug}`)).status, 404);

		const adminPublish = await fetch(`${base}/api/documents/${fixtureId}/publish`, {
			method: 'POST',
			headers: {
				origin: base,
				cookie: staffACookie,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ expectedRevision: revAfterStaffSave })
		});
		assert.equal(adminPublish.status, 200, `admin session publish → ${adminPublish.status}`);
		const pubHtml = await (await fetch(`${base}/blog/${slug}`)).text();
		assert.ok(pubHtml.includes(staffSessionMarker), 'published after admin session publish');

		await mcpCall(apiKey, 'list_interactive_components', {});

		const manifest = JSON.parse(
			await readFile(path.join(dataRoot, 'import-manifest.json'), 'utf8')
		);
		const renderedPrompts = await assertCorpusFromManifest(manifest);
		const corpusCount = manifest.sourcePostCount ?? manifest.posts.length;

		const archiveRes = await fetch(`${base}/blog`);
		assert.equal(archiveRes.status, 200, 'archive page');
		const archiveHtml = await archiveRes.text();
		assert.equal(await countArchiveLabNotesPosts(), corpusCount, 'archive card count');
		await assertImage200(archiveHtml, 'archive thumbs');

		assert.ok(
			!archiveHtml.includes('native-svelte-visual-lab'),
			'visual lab draft not on archive'
		);

		const visualMint = await mcpCall(apiKey, 'mint_preview_token', {
			slug: 'native-svelte-visual-lab'
		});
		assert.ok(!visualMint.error, JSON.stringify(visualMint.error));
		const visualRes = await fetch(
			`${base}/api/lab-notes/public/blog-posts/native-svelte-visual-lab?preview=${encodeURIComponent(visualMint.token)}`
		);
		assert.equal(visualRes.status, 200);
		const visualBody = await visualRes.json();
		const blocks = visualBody.data?.content ?? [];
		assert.ok(
			blocks.some((b) => b?._type === 'fluencyLevelPicker'),
			'visual lab draft PT includes fluencyLevelPicker'
		);
		assert.equal((await fetch(`${base}/blog/native-svelte-visual-lab`)).status, 404);

		const humanApprovalGap =
			'MCP uses OAuth 2.1 (Better Auth mcp plugin): chat tokens map to Aphex users with draft capabilities only (no document.publish). Admin browser sessions keep publish. API keys remain for server-to-server reads.';

		console.log(
			JSON.stringify(
				{
					ok: true,
					base,
					articles: manifest.posts.length,
					covers: manifest.coverPaths.length,
					renderedPrompts,
					humanApprovalGap,
					checks: [
						'OAuth well-known metadata',
						'MCP OAuth token mint (PKCE + consent)',
						'eval staff identities (session sign-in)',
						'verification fixture cleanup (pre/post)',
						'draft privacy',
						'preview 401 without capability',
						'preview no-store',
						'OAuth MCP create links (admin + preview)',
						'OAuth staff A/B draft read/write',
						'revision refresh',
						'stale OAuth MCP update',
						'OAuth publish_document denied',
						'OAuth update publish:true denied',
						'OAuth create publish:true denied',
						'outsider draft query denied',
						'outsider OAuth MCP denied',
						'admin session publish',
						'corpus public pages + covers HTTP 200 (sourcePostCount)',
						'manifest runPrompt counts',
						'native-svelte-visual-lab preview token API',
						'archive matches sourcePostCount'
					]
				},
				null,
				2
			)
		);
	} finally {
		await deleteVerificationFixtures(staffACookie);
		const manifest = JSON.parse(
			await readFile(path.join(dataRoot, 'import-manifest.json'), 'utf8')
		);
		const corpusCount = manifest.sourcePostCount ?? manifest.posts.length;
		const after = await countArchiveLabNotesPosts();
		assert.equal(after, corpusCount, 'archive after cleanup');
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
