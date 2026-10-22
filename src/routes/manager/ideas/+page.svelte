<script lang="ts">
	// Manager view of the public ideas board, ranked by upvotes, scoped to the
	// manager's department. Confidential reports are never listed here.
	import { app } from '$lib/app.svelte.ts';
	import { publicIdeas, submitterLabel } from '$lib/core/rules.ts';
	import { formatDate } from '$lib/core/time.ts';
	import Pill from '$lib/components/Pill.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import DetailDrawer from '$lib/components/DetailDrawer.svelte';

	let openId = $state<string | null>(null);
	const ideas = $derived(publicIdeas(app.scopedFeedback).sort((a, b) => b.upvotes.length - a.upvotes.length || b.createdAt - a.createdAt));
	const openItem = $derived(openId ? app.byId(openId) : undefined);
</script>

<svelte:head><title>Ideas - VoiceBox</title></svelte:head>

<h1 data-testid="page-title">Ideas</h1>
<p style="max-width:62ch">
	Public suggestions ranked by employee upvotes. Open one to triage, respond or assign it like any other item.
</p>

{#if ideas.length === 0}
	<div class="card empty"><h3>No public ideas in your scope</h3></div>
{:else}
	<div class="table-wrap" style="margin-top:var(--s-4)">
		<table class="data" data-testid="ideas-table">
			<thead>
				<tr>
					<th scope="col" style="width:70px">Upvotes</th>
					<th scope="col">Title</th>
					<th scope="col">Category</th>
					<th scope="col">Status</th>
					<th scope="col">Submitter</th>
					<th scope="col">Department</th>
					<th scope="col">Comments</th>
					<th scope="col">Submitted</th>
				</tr>
			</thead>
			<tbody>
				{#each ideas as item (item.id)}
					<tr onclick={() => (openId = item.id)} tabindex="0" onkeydown={(e) => e.key === 'Enter' && (openId = item.id)} data-testid="idea-row">
						<td class="num votes">{item.upvotes.length}</td>
						<td class="title-cell">{item.title}</td>
						<td>{item.category}</td>
						<td><Pill kind="status" value={item.status} /></td>
						<td>{submitterLabel(item)}</td>
						<td>{item.department}</td>
						<td class="num"><Icon name="comment" size={13} /> {item.comments.length}</td>
						<td>{formatDate(item.createdAt)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

{#if openItem}<DetailDrawer item={openItem} onclose={() => (openId = null)} />{/if}

<style>
	h1 {
		margin-bottom: var(--s-2);
	}
	.votes {
		font-weight: 600;
		color: var(--teal);
	}
	td.num :global(.icon) {
		display: inline-block;
		vertical-align: -2px;
	}
</style>
