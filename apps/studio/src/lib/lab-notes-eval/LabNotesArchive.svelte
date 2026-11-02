<script lang="ts">
	import LabNotesSignup from '$lib/lab-notes-eval/LabNotesSignup.svelte';
	import { postTags } from '$lib/blog/tags';
	import { Image } from '@aphexcms/cms-core/image';
	import type { BlogPost } from '$lib/generated-types';
	import type { TagInfo } from '$lib/blog/tags';

	const TOPICS = [
		{ slug: 'work-design', name: 'Work design' },
		{ slug: 'ai-fluency', name: 'AI fluency' },
		{ slug: 'building-with-ai', name: 'Building with AI' },
		{ slug: 'evidence-and-value', name: 'Evidence and value' },
		{ slug: 'people-and-teams', name: 'People and teams' }
	];

	let {
		data
	}: {
		data: {
			posts: BlogPost[];
			tagMap: Record<string, TagInfo>;
			topic: string | null;
		};
	} = $props();

	function formatDate(dateStr: string | null | undefined) {
		if (!dateStr) return '';
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function topicLabel(post: (typeof data.posts)[0]) {
		const tags = postTags(post.tags, data.tagMap);
		const editorial = tags.filter((t) => t.slug !== 'lab-notes' && t.slug !== 'people-first');
		return editorial.map((t) => t.title).join(' · ');
	}
</script>

<svelte:head>
	<title>Lab Notes | Workplace Labs</title>
	<meta name="description" content="AI adoption that compounds." />
</svelte:head>

<div class="archive-wrap lab-notes-shell">
	<p class="archive-eyebrow">Lab Notes</p>
	<h1 class="archive-title">AI adoption that compounds</h1>
	<p class="archive-dek">
		Our take on the latest AI adoption news, and how to put it into practice today.
	</p>

	<nav class="topic-nav" aria-label="Topics">
		<span class="topic-label">Topics</span>
		<a href="/blog" class:selected={!data.topic}>All</a>
		{#each TOPICS as t}
			<a href="/blog?topic={t.slug}" class:selected={data.topic === t.slug}>{t.name}</a>
		{/each}
	</nav>

	<ul class="card-list">
		{#each data.posts as post}
			<li>
				<a class="card-link" href="/blog/{post.slug}">
					{#if post.coverImage}
						<div class="card-thumb-wrap">
							<Image value={post.coverImage} alt={post.title ?? ''} sizes="120px" />
						</div>
					{/if}
					<div>
						<h2 class="card-title">{post.title}</h2>
						<p class="card-excerpt">{post.excerpt}</p>
						<p class="card-meta">
							{formatDate(post.postDate)} · {topicLabel(post)}
						</p>
					</div>
				</a>
			</li>
		{/each}
	</ul>

	<LabNotesSignup />
</div>

<style>
	@import '$lib/lab-notes-eval/lab-notes.css';
	.card-thumb-wrap {
		width: 7.5rem;
		flex-shrink: 0;
	}
	.card-thumb-wrap :global(img) {
		width: 100%;
		height: auto;
		border-radius: 0.5rem;
	}
	.topic-label {
		display: block;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--wl-muted);
		margin-bottom: 0.5rem;
	}
</style>
