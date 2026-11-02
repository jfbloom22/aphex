<script lang="ts">
	import Prose from '$lib/components/render/Prose.svelte';
	import { postTags } from '$lib/blog/tags';
	import { postAuthor } from '$lib/blog/authors';
	import { readingTime } from '$lib/blog/reading-time';
	import type { BlogPostWithLocalMeta } from '$lib/lab-notes-eval/document-meta';

	let { data } = $props();
	const post = $derived(data.post as BlogPostWithLocalMeta);
	const tags = $derived(postTags(post.tags, data.tagMap));
	const author = $derived(postAuthor(post.author, data.authorMap));
</script>

<svelte:head>
	<title>Draft preview · {post.title ?? post.slug}</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="post-wrap lab-notes-preview">
	<p class="preview-banner">Draft preview — not published</p>
	<article>
		<h1>{post.title}</h1>
		{#if post.excerpt}<p class="lead">{post.excerpt}</p>{/if}
		<p class="meta">
			{#if author}{author.name}{/if}
			{#if post._meta?.revision != null}
				· revision {post._meta.revision}
			{/if}
		</p>
		<Prose value={post.content} />
	</article>
</div>

<style>
	@import '$lib/lab-notes-eval/lab-notes.css';
	.preview-banner {
		background: #fef3c7;
		color: #92400e;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
	}
	.lead {
		font-size: 1.125rem;
		color: var(--wl-muted);
	}
	.meta {
		font-size: 0.875rem;
		color: var(--wl-muted);
	}
</style>
