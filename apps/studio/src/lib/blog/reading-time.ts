import type { BlogPost } from '$lib/generated-types';
import { readingTimeMinutes } from './reading-time-minutes';

/** Estimated reading time, e.g. "5 min read". Always at least 1 minute. */
export function readingTime(content: BlogPost['content'] | undefined): string {
	return `${readingTimeMinutes(content)} min read`;
}
