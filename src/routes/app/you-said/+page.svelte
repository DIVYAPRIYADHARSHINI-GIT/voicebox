<script lang="ts">
	// "You said, we did": resolved items with their response and date, so people
	// can see that feedback leads to action. Confidential reports are excluded.
	import { app } from '$lib/app.svelte.ts';
	import { formatDate } from '$lib/core/time.ts';
	import Pill from '$lib/components/Pill.svelte';
	import Icon from '$lib/components/Icon.svelte';

	// Served by the API, already filtered to resolved, non-confidential items.
	const wall = $derived([...app.wall].sort((a, b) => (b.resolvedAt ?? b.updatedAt) - (a.resolvedAt ?? a.updatedAt)));
</script>

<svelte:head><title>You said, we did - VoiceBox</title></svelte:head>

<h1 data-testid="page-title">You said, we did</h1>
<p style="max-width:62ch">
	Feedback that has been resolved, with the response and the date it was closed. This wall is the record of what actually
	changed.
</p>

{#if wall.length === 0}
	<div class="card empty"><h3>Nothing resolved yet</h3><p>Resolved feedback with a public response appears here.</p></div>
{:else}
	<ul class="wall" data-testid="you-said-wall">
		{#each wall as item (item.id)}
			<li class="card tight">
				<div class="said">
					<span class="tag">You said</span>
					<strong>{item.title}</strong>
					<p class="desc">{item.description}</p>
					<div class="row">
						<Pill kind="plain" value={item.category} />
						<span class="caption">{item.anonymous ? 'Anonymous' : item.authorName} &middot; {item.department}</span>
					</div>
				</div>
				<div class="did">
					<span class="tag did-tag"><Icon name="check" size={13} /> We did</span>
					<p style="margin:0; color:var(--text)">{item.responses[item.responses.length - 1].text}</p>
					<div class="caption" style="margin-top:var(--s-2)">Resolved {formatDate(item.resolvedAt ?? item.updatedAt)}</div>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	h1 {
		margin-bottom: var(--s-2);
	}
	.wall {
		list-style: none;
		margin: var(--s-4) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.wall li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--s-4);
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-3);
		margin-bottom: var(--s-2);
	}
	.did-tag {
		color: var(--green);
	}
	.said strong {
		display: block;
		margin-bottom: var(--s-2);
	}
	.desc {
		font-size: 13px;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.did {
		border-left: 2px solid var(--green);
		padding-left: var(--s-4);
	}
	@media (max-width: 700px) {
		.wall li {
			grid-template-columns: minmax(0, 1fr);
		}
		.did {
			border-left: 0;
			border-top: 1px solid var(--border);
			padding-left: 0;
			padding-top: var(--s-3);
		}
	}
</style>
