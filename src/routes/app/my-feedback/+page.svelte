<script lang="ts">
	// My feedback: named submissions only. Anonymous items never appear here,
	// even when the signed-in employee submitted them - they need the code.
	import { page } from '$app/state';
	import { app } from '$lib/app.svelte.ts';
	import { formatDate, formatDateTime } from '$lib/core/time.ts';
	import Pill from '$lib/components/Pill.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import FeedbackTimeline from '$lib/components/FeedbackTimeline.svelte';

	const items = $derived(app.myFeedback());
	let openId = $state<string | null>(null);

	$effect(() => {
		const want = page.url.searchParams.get('item');
		if (want && items.some((i) => i.id === want)) openId = want;
	});
</script>

<svelte:head><title>My feedback - VoiceBox</title></svelte:head>

<h1 data-testid="page-title">My feedback</h1>
<p style="max-width:62ch">
	Everything you submitted with your name. Anonymous submissions are not listed here - not even your own - because nothing
	links them to your account. Use <a href="/track">Track by code</a> for those.
</p>

{#if !app.ready}
	<div class="card stack">
		{#each [1, 2, 3] as i}<div class="skeleton" style="height:48px"></div>{/each}
	</div>
{:else if items.length === 0}
	<div class="card empty" data-testid="my-feedback-empty">
		<h3>You have not submitted named feedback yet</h3>
		<p>When you do, it appears here with its status, the public responses and the full history.</p>
		<a class="btn primary" href="/app">Submit feedback</a>
	</div>
{:else}
	<ul class="list" data-testid="my-feedback-list">
		{#each items as item (item.id)}
			<li class="card tight">
				<button class="row-head" onclick={() => (openId = openId === item.id ? null : item.id)} aria-expanded={openId === item.id}>
					<div class="titles">
						<strong>{item.title}</strong>
						<div class="meta">
							<Pill kind="status" value={item.status} />
							<Pill kind="plain" value={item.category} />
							<Pill kind="type" value={item.type} />
							{#if item.responses.length}<span class="pill"><Icon name="comment" size={12} />{item.responses.length} response{item.responses.length > 1 ? 's' : ''}</span>{/if}
							<span class="caption">Submitted {formatDate(item.createdAt)}</span>
						</div>
					</div>
					<Icon name={openId === item.id ? 'chevronDown' : 'chevron'} size={16} />
				</button>

				{#if openId === item.id}
					<div class="detail" data-testid="my-feedback-detail">
						<p class="desc">{item.description}</p>

						<h3>Responses</h3>
						{#if item.responses.length === 0}
							<p class="caption">No public response yet. You will be notified when one is added.</p>
						{:else}
							<div class="stack" style="gap:var(--s-2)">
								{#each item.responses as r (r.id)}
									<div class="response" data-testid="public-response">
										<div class="caption">{r.authorName} &middot; {r.authorRole === 'admin' ? 'Admin/HR' : 'Manager'} &middot; {formatDateTime(r.at)}</div>
										<p style="margin:4px 0 0; color:var(--text)">{r.text}</p>
									</div>
								{/each}
							</div>
						{/if}

						{#if item.status === 'Declined' && item.declineReason}
							<div class="notice warn" style="margin-top:var(--s-3)">
								<Icon name="info" size={16} />
								<span><strong>Declined:</strong> {item.declineReason}</span>
							</div>
						{/if}

						<h3>History</h3>
						<FeedbackTimeline {item} />

						<p class="caption" style="margin-top:var(--s-3)">
							Internal notes written by managers are never shown here.
						</p>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	h1 {
		margin-bottom: var(--s-2);
	}
	.list {
		list-style: none;
		margin: var(--s-4) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.row-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		width: 100%;
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		text-align: left;
		cursor: pointer;
		color: var(--text-2);
		min-height: 44px;
	}
	.titles strong {
		display: block;
		font-size: 14px;
		color: var(--text);
		margin-bottom: 6px;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		align-items: center;
	}
	.detail {
		margin-top: var(--s-4);
		padding-top: var(--s-4);
		border-top: 1px solid var(--border);
	}
	.detail h3 {
		margin: var(--s-4) 0 var(--s-2);
	}
	.desc {
		white-space: pre-wrap;
		color: var(--text-2);
	}
	.response {
		border-left: 2px solid var(--teal);
		background: var(--surface-2);
		border-radius: 0 var(--r) var(--r) 0;
		padding: var(--s-3);
	}
</style>
