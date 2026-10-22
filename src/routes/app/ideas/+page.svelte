<script lang="ts">
	// Public ideas board: upvote once (toggle), comment, sort by top or newest.
	// Confidential reports and concerns about individuals are never listed.
	import { app } from '$lib/app.svelte.ts';
	import { COMMENT_MAX } from '$lib/core/rules.ts';
	import { formatDate, relative } from '$lib/core/time.ts';
	import Pill from '$lib/components/Pill.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let sort = $state<'top' | 'newest'>('top');
	let openComments = $state<string | null>(null);
	let draft = $state('');

	const ideas = $derived(
		[...app.ideas].sort((a, b) => (sort === 'top' ? b.upvotes.length - a.upvotes.length || b.createdAt - a.createdAt : b.createdAt - a.createdAt))
	);

	async function comment(itemId: string) {
		if (!draft.trim()) return;
		const text = draft;
		draft = '';
		await app.addComment(itemId, text);
		app.toast('Comment added.', 'success');
	}
</script>

<svelte:head><title>Ideas board - VoiceBox</title></svelte:head>

<div class="head">
	<div>
		<h1 data-testid="page-title">Ideas board</h1>
		<p style="margin:var(--s-2) 0 0">
			Suggestions and ideas that colleagues chose to make public. Upvote the ones you want prioritised - one vote each.
		</p>
	</div>
	<div class="row" role="group" aria-label="Sort ideas">
		<button class="btn sm" class:primary={sort === 'top'} onclick={() => (sort = 'top')} data-testid="sort-top">Top</button>
		<button class="btn sm" class:primary={sort === 'newest'} onclick={() => (sort = 'newest')} data-testid="sort-newest">Newest</button>
	</div>
</div>

{#if ideas.length === 0}
	<div class="card empty"><h3>No public ideas yet</h3><p>Tick "Show this on the public ideas board" when you submit a suggestion.</p></div>
{:else}
	<ul class="grid" data-testid="ideas-list">
		{#each ideas as item (item.id)}
			<li class="card tight idea">
				<div class="vote-col">
					<button
						class="vote"
						class:voted={app.hasUpvoted(item)}
						onclick={() => void app.toggleUpvote(item.id)}
						aria-pressed={app.hasUpvoted(item)}
						aria-label="{app.hasUpvoted(item) ? 'Remove your upvote from' : 'Upvote'} {item.title}"
						data-testid="upvote-{item.id}"
					>
						<Icon name="upvote" size={16} />
						<span class="num" data-testid="votes-{item.id}">{item.upvotes.length}</span>
					</button>
				</div>
				<div class="idea-body">
					<strong>{item.title}</strong>
					<p class="desc">{item.description}</p>
					<div class="meta">
						<Pill kind="status" value={item.status} />
						<Pill kind="plain" value={item.category} />
						<span class="pill {item.anonymous ? 'anon' : ''}">
							<Icon name={item.anonymous ? 'lock' : 'user'} size={12} />
							{item.anonymous ? 'Anonymous' : item.authorName}
						</span>
						<span class="caption">{item.department} &middot; {formatDate(item.createdAt)}</span>
					</div>

					{#if item.responses.length}
						<div class="response">
							<div class="caption">Response from {item.responses[item.responses.length - 1].authorName}</div>
							<p style="margin:2px 0 0; color:var(--text)">{item.responses[item.responses.length - 1].text}</p>
						</div>
					{/if}

					<button class="btn sm ghost" onclick={() => (openComments = openComments === item.id ? null : item.id)} data-testid="toggle-comments-{item.id}">
						<Icon name="comment" size={14} />
						{item.comments.length} comment{item.comments.length === 1 ? '' : 's'}
					</button>

					{#if openComments === item.id}
						<div class="comments">
							{#each item.comments as c (c.id)}
								<div class="comment">
									<div class="caption">{c.authorName} &middot; {relative(c.at)}</div>
									<p style="margin:2px 0 0">{c.text}</p>
								</div>
							{/each}
							<div class="row" style="margin-top:var(--s-2)">
								<input
									class="input"
									style="flex:1; min-width:180px"
									bind:value={draft}
									maxlength={COMMENT_MAX}
									placeholder="Add a short comment"
									aria-label="Comment on {item.title}"
									data-testid="comment-input"
								/>
								<button class="btn sm primary" onclick={() => void comment(item.id)} data-testid="comment-submit">Post</button>
							</div>
						</div>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--s-4);
		flex-wrap: wrap;
		margin-bottom: var(--s-4);
	}
	.head p {
		max-width: 60ch;
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--s-3);
	}
	.idea {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr);
		gap: var(--s-3);
	}
	.vote {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		width: 48px;
		min-height: 52px;
		border: 1px solid var(--border-strong);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--text-2);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.12s ease;
		padding: 6px 0;
	}
	.vote:hover {
		border-color: var(--teal);
		color: var(--teal);
	}
	.vote.voted {
		background: var(--teal);
		border-color: var(--teal);
		color: #fff;
	}
	.idea-body strong {
		display: block;
		margin-bottom: 4px;
	}
	.desc {
		font-size: 13px;
		margin-bottom: var(--s-2);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		align-items: center;
		margin-bottom: var(--s-2);
	}
	.response {
		border-left: 2px solid var(--green);
		background: var(--green-050);
		padding: var(--s-2) var(--s-3);
		border-radius: 0 var(--r) var(--r) 0;
		font-size: 13px;
		margin-bottom: var(--s-2);
	}
	.comments {
		margin-top: var(--s-2);
		padding-top: var(--s-2);
		border-top: 1px solid var(--border);
		font-size: 13px;
	}
	.comment {
		padding: var(--s-2) 0;
		border-bottom: 1px solid var(--border);
	}
	.comment:last-of-type {
		border-bottom: 0;
	}
</style>
