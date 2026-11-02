import type { BlogPost } from '$lib/generated-types';

/** `_meta` shape returned by Local API (`transformDocument` in cms-core). Generated schema types omit `revision`. */
export type LocalApiDocumentMeta = NonNullable<BlogPost['_meta']> & { revision: number };

export type BlogPostWithLocalMeta = BlogPost & { _meta?: LocalApiDocumentMeta };
