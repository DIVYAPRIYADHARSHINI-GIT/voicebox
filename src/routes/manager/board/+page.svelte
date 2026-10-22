<script lang="ts">
	// Kanban board by status, with the same filters as the inbox.
	import { app } from '$lib/app.svelte.ts';
	import { applyFilters, emptyFilters, sortItems, type FilterState, type SortKey } from '$lib/core/filters.ts';
	import { isConfidential, submitterLabel } from '$lib/core/rules.ts';
	import { formatDate } from '$lib/core/time.ts';
	import { STATUSES } from '$lib/core/types.ts';
	import Icon from '$lib/components/Icon.svelte';
	import Pill from '$lib/components/Pill.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import DetailDrawer from '$lib/components/DetailDrawer.svelte';

	let filters = $state<FilterState>(emptyFilters());
	let sort = $state<SortKey>('priority');
	let openId = $state<string | null>(null);

	const scoped = $derived(app.scopedFeedback);
	const filtered = $derived(sortItems(applyFilters(scoped, filters, { viewerId: app.account?.id, sla: app.sla }), sort, (f) => app.due(f)));
	// Cap cards per column so a huge dataset cannot freeze the board.
	const COLUMN_CAP = 40;
	const columns = $derived(STATUSES.map((status) => ({ status, items: filtered.filter((f) => f.status === status) })));
	const openItem = $derived(openId ? app.byId(openId) : undefined);
</script>

<svelte:head><title>Board - VoiceBox</title></svelte:head>

<div class="page-head">
	<div>
		<h1 data-testid="page-title">Board</h1>
		<p style="margin:var(--s-2) 0 0">Feedback grouped by status. Open a card to move it through the workflow.</p>
	</div>
	<a class="btn" href="/manager"><Icon name="inbox" size={15} /> Table view</a>
</div>

<FilterBar {filters} {sort} count={filtered.length} total={scoped.length} onchange={(f) => (filters = f)} onsort={(s) => (sort = s)} />

<div class="board" data-testid="kanban">
	{#each columns as col (col.status)}
		<section class="col" aria-label="{col.status} ({col.items.length})">
			<header>
				<Pill kind="status" value={col.status} />
				<span class="caption num">{col.items.length}</span>
			</header>
			<div class="cards">
				{#each col.items.slice(0, COLUMN_CAP) as item (item.id)}
					<button class="kcard" onclick={() => { openId = item.id; app.markRead(item.id, true); }} data-testid="kanban-card">
						<strong>{item.title}</strong>
						<div class="kmeta">
							<Pill kind="priority" value={item.priority} />
							{#if app.overdue(item)}<Pill kind="overdue" value="Overdue" />{/if}
							{#if isConfidential(item)}<Pill kind="sensitive" value="Sensitive" />{/if}
						</div>
						<div class="caption">{submitterLabel(item)} &middot; {item.department}</div>
						<div class="caption">Due {formatDate(app.due(item))}</div>
					</button>
				{/each}
				{#if col.items.length > COLUMN_CAP}
					<p class="caption" style="text-align:center">+{col.items.length - COLUMN_CAP} more - narrow the filters to see them</p>
				{/if}
				{#if col.items.length === 0}
					<p class="caption" style="text-align:center; padding:var(--s-4) 0">Nothing here</p>
				{/if}
			</div>
		</section>
	{/each}
</div>

{#if openItem}
	<DetailDrawer item={openItem} onclose={() => (openId = null)} />
{/if}

<style>
	.page-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--s-4);
		flex-wrap: wrap;
		margin-bottom: var(--s-4);
	}
	.board {
		display: grid;
		grid-template-columns: repeat(5, minmax(220px, 1fr));
		gap: var(--s-3);
		overflow-x: auto;
		padding-bottom: var(--s-3);
	}
	.col {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
		display: flex;
		flex-direction: column;
		min-height: 180px;
	}
	.col header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
		padding: var(--s-3);
		border-bottom: 1px solid var(--border);
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding: var(--s-2);
		max-height: 62vh;
		overflow-y: auto;
	}
	.kcard {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
		text-align: left;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r);
		padding: var(--s-3);
		font: inherit;
		cursor: pointer;
		box-shadow: var(--shadow-1);
		transition: border-color 0.12s ease;
	}
	.kcard:hover {
		border-color: var(--teal);
	}
	.kcard strong {
		font-size: 13px;
		line-height: 1.35;
	}
	.kmeta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	@media (max-width: 1100px) {
		.board {
			grid-template-columns: repeat(5, minmax(210px, 240px));
		}
	}
</style>
