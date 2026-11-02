#!/usr/bin/env node
/**
 * Create a one-off MCP API key using bootstrap credentials (production import).
 * Writes LAB_NOTES_DATA_DIR/mcp-api-key.txt. Never logs the key.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { signInEmail } from './oauth-token.mjs';

const base = (process.env.LAB_NOTES_BASE ?? 'https://www.workplacelabs.io').replace(/\/$/, '');
const dataRoot = process.env.LAB_NOTES_DATA_DIR ?? '/tmp/lab-notes-prod-import';
const bootstrapPath =
	process.env.LAB_NOTES_BOOTSTRAP_JSON ?? '/etc/lab-notes/bootstrap-signin.json';

async function main() {
	const payload = JSON.parse(await readFile(bootstrapPath, 'utf8'));
	const cookie = await signInEmail(base, payload.email, payload.password);
	await fetch(`${base}/admin/`, { redirect: 'follow', headers: { cookie, origin: base } });
	const keyRes = await fetch(`${base}/api/settings/api-keys`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			cookie,
			origin: base
		},
		body: JSON.stringify({
			name: `lab-notes-import-${new Date().toISOString().slice(0, 10)}`,
			permissions: ['write']
		})
	});
	if (keyRes.status !== 200) {
		const text = await keyRes.text();
		throw new Error(`create api key HTTP ${keyRes.status}: ${text.slice(0, 200)}`);
	}
	const body = JSON.parse(await keyRes.text());
	const apiKeyObj = body.data?.apiKey ?? body.apiKey;
	const apiKey = apiKeyObj?.key ?? body.data?.key;
	if (!apiKey || typeof apiKey !== 'string') {
		throw new Error('create api key response missing key');
	}
	await mkdir(dataRoot, { recursive: true });
	const keyFile = path.join(dataRoot, 'mcp-api-key.txt');
	await writeFile(keyFile, `${apiKey}\n`, { mode: 0o600 });
	console.log(JSON.stringify({ ok: true, keyFile, base }));
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
