import { env } from '$env/dynamic/private';

/** React website origin for view links and SEO snippets (not the Aphex admin host). */
export function labNotesPublicSiteOrigin(): string {
	const fromEnv = env.LAB_NOTES_PUBLIC_ORIGIN ?? process.env.LAB_NOTES_PUBLIC_ORIGIN;
	const origin = (fromEnv ?? 'https://www.workplacelabs.io').replace(/\/$/, '');
	return origin;
}

export function labNotesPreviewViewUrl(slug: string, token: string): string {
	const origin = labNotesPublicSiteOrigin();
	return `${origin}/blog/${slug}/?preview=${encodeURIComponent(token)}`;
}
