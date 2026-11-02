import { readFile } from 'node:fs/promises';

const DEFAULT_ENV_FILE =
	'/Users/jfhome/devProjects/workplace-labs/workplace-labs-web/.env';

/** @param {string} [envFile] */
export async function loadGhostContentApiConfig(envFile = process.env.GHOST_ENV_FILE ?? DEFAULT_ENV_FILE) {
	const text = await readFile(envFile, 'utf8');
	/** @type {Record<string, string>} */
	const vars = {};
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq < 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		vars[key] = value;
	}
	const url = (vars.GHOST_URL ?? vars.NEXT_PUBLIC_GHOST_URL ?? '').replace(/\/$/, '');
	const key = vars.GHOST_CONTENT_API_KEY ?? vars.GHOST_CONTENT_KEY ?? '';
	if (!url || !key) {
		throw new Error(
			`Missing GHOST_URL and GHOST_CONTENT_API_KEY in ${envFile} (do not commit secrets).`
		);
	}
	return { url, key };
}
