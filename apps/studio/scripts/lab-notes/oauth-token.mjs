import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

const REDIRECT_URI = 'http://127.0.0.1:8765/oauth/callback';

function base64Url(buf) {
	return buf.toString('base64url');
}

function cookieHeader(setCookieList) {
	if (!setCookieList?.length) return '';
	return setCookieList.map((c) => c.split(';')[0]).join('; ');
}

export async function signInEmail(base, email, password) {
	for (let attempt = 0; attempt < 12; attempt++) {
		await new Promise((r) => setTimeout(r, 800 + attempt * 500));
		const res = await fetch(`${base}/api/auth/sign-in/email`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: base },
			body: JSON.stringify({ email, password })
		});
		if (res.status === 429) continue;
		assert.equal(res.status, 200, `sign-in ${email} → ${res.status}`);
		const cookies = res.headers.getSetCookie?.() ?? [];
		assert.ok(cookies.length >= 1, `sign-in ${email} set-cookie`);
		return cookieHeader(cookies);
	}
	assert.fail(`sign-in ${email} rate limited after retries`);
}

/** PKCE + dynamic client registration + consent; returns Bearer access token for MCP. */
export async function mintMcpOAuthAccessToken(base, email, password, existingCookie) {
	const sessionCookie = existingCookie ?? (await signInEmail(base, email, password));

	const reg = await fetch(`${base}/api/auth/mcp/register`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: base },
		body: JSON.stringify({
			redirect_uris: [REDIRECT_URI],
			token_endpoint_auth_method: 'none',
			client_name: 'lab-notes-verify',
			grant_types: ['authorization_code'],
			response_types: ['code']
		})
	});
	assert.ok(reg.status === 200 || reg.status === 201, `mcp/register → ${reg.status}`);
	const client = await reg.json();
	assert.ok(client.client_id, 'client_id');

	const verifier = base64Url(randomBytes(32));
	const challenge = base64Url(createHash('sha256').update(verifier).digest());
	const state = base64Url(randomBytes(16));

	const authUrl = new URL(`${base}/api/auth/mcp/authorize`);
	authUrl.searchParams.set('client_id', client.client_id);
	authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', 'openid profile email offline_access');
	authUrl.searchParams.set('code_challenge', challenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');
	authUrl.searchParams.set('state', state);
	authUrl.searchParams.set('prompt', 'consent');

	let nextUrl = authUrl.toString();
	let cookie = sessionCookie;
	for (let hop = 0; hop < 8; hop++) {
		const res = await fetch(nextUrl, {
			redirect: 'manual',
			headers: { cookie, origin: base }
		});
		if (res.status >= 300 && res.status < 400) {
			const loc = res.headers.get('location');
			assert.ok(loc, 'redirect location');
			const merged = res.headers.getSetCookie?.() ?? [];
			if (merged.length) cookie = cookieHeader(merged.concat(cookie.split('; ').filter(Boolean)));
			nextUrl = loc.startsWith('http') ? loc : new URL(loc, base).toString();
			if (nextUrl.startsWith(REDIRECT_URI)) break;
			if (nextUrl.includes('/oauth/mcp-consent')) {
				const consentUrl = new URL(nextUrl);
				const consentCode = consentUrl.searchParams.get('consent_code');
				assert.ok(consentCode, 'consent_code');
				const consentRes = await fetch(`${base}/api/auth/oauth2/consent`, {
					method: 'POST',
					redirect: 'manual',
					headers: { cookie, origin: base, 'content-type': 'application/json' },
					body: JSON.stringify({ accept: true, consent_code: consentCode })
				});
				if (consentRes.status >= 300 && consentRes.status < 400) {
					nextUrl = consentRes.headers.get('location') ?? '';
					continue;
				}
				const body = await consentRes.json().catch(() => ({}));
				if (body.url) {
					nextUrl = body.url;
					continue;
				}
			}
			continue;
		}
		assert.fail(`authorize hop ${hop} → ${res.status}`);
	}

	const callbackUrl = new URL(nextUrl);
	assert.equal(callbackUrl.origin + callbackUrl.pathname, REDIRECT_URI, 'callback redirect');
	const code = callbackUrl.searchParams.get('code');
	assert.ok(code, 'authorization code');

	const tokenRes = await fetch(`${base}/api/auth/mcp/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: REDIRECT_URI,
			client_id: client.client_id,
			code_verifier: verifier
		})
	});
	assert.equal(tokenRes.status, 200, `token → ${tokenRes.status}`);
	const tokenBody = await tokenRes.json();
	assert.ok(tokenBody.access_token, 'access_token');
	return tokenBody.access_token;
}

export async function mcpCallOAuth(base, accessToken, name, args) {
	const response = await fetch(`${base}/mcp`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${accessToken}`,
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
